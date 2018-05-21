const shell = require('shelljs');
const LogScale = require('log-scale');

module.exports = class DisplayMatrix {
  constructor() {
    this.device = null;
    this.prevUptime = null; // used for determining if ever been up to begin with.
    this.logScale = new LogScale(0, 7);
    this.graphMaxPing = 500;
    this.color = 'blue';
    this.checkLocalNetwork = null;
    this.checkDomain = null;

    this.CODES = {
      PREFIX: '\\xFE',
      NEWLINE: '\\x0A',
      CLEAR: '\\x58',
      POS: '\\x47', //cursor position x,y
      COLOR: '\\xD0',
    }

    // downtime components
    this.uptime = Date.now();
    this.downtime = null;
    this.prevDownDuration = 0;
    

    // graph components
    this.BLOCKS = {
      CONSOLE: ['▁','▂','▃','▄','▅','▆','▇','█'],
      DEVICE: ['\\x00','\\x01','\\x02','\\x03','\\x04','\\x05','\\x06','\\x07'],
    };
    this.graph = [0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    this.lastEntry = 0;

    // setInterval components
    this.debounce = false;
    this.clock = null;

    // state for minimizing updates
    this.state = {
      a: '',
      b: '',
    };
  }

  static ping(url) {
    return new Promise(resolve => {
      let result = 10000;

      shell.exec(`ping -c 1 -W 10 ${url} | grep "time="`, { silent: true }, (code, stdout, stderr) => {
        // timeout or error
        if (code) {
          resolve(0 - code);
          return;
        }

        // successful ping
        const match = stdout.match(/time=(\d+\.\d+)\s(\w{2})/);
        if (match) {
          const unit = match[2];
          let time = match[1] && parseInt(match[1]);
          if (unit === 's') time *= 1000;
          result = time;
        }

        // result = (Math.random() * 1500) | 0; // debug
        resolve(result);
      });
    });
  }

  static textAlign(direction, base, str) {
    let newStr = str.slice(0,7);
    let newBase;
    let result = '';

    if (direction === 'right') {
      newBase = base.slice(0, 16 - newStr.length);
      result = newBase + newStr;
    } else {
      newBase = base.slice(8);
      result = newStr + ' ' + newBase;
    }

    while (result.length < 16) result = ' ' + result;
    return result;
  }

  static formatTime(seconds) {
    const time = {
      d: seconds / 60 / 60 / 24 | 0,
      h: seconds / 60 / 60 % 24 | 0,
      m: seconds / 60 % 60 | 0,
      s: seconds % 60,
    };

    const pad = int => `${int}`.length < 2 ? `0${int}` : `${int}`;
    const append = (base, numStr) => base.length + numStr.length <= 8 ? base + numStr : base;

    let final = '';
    Object.keys(time).forEach(unit => {
      if (!time[unit] && unit !== 's') return;
      let timeUnitStr = time[unit];
      if (final) timeUnitStr = pad(time[unit])
      final = append(final, `${timeUnitStr}${unit}`);
    });

    return final;
  }

  static getUpdateFields(stringA, stringB) {
    const fields = {};
    for (let i=0; i<16; i++) {
      if (stringA[i] !== stringB[i]) {
        fields[i] = stringB[i];
      }
    }
    return fields;
  }

  getMatrixInstructions(updateFieldsObj, rowNum) {
    let instructions = '';
    const updateFieldsKeys = Object.keys(updateFieldsObj);
    const hex = str => (parseInt(str) + 1).toString(16);
    const pad = str => str.length < 2 ? `0${str}` : str;
    const replaceUnicode = char => {
      const idx = this.BLOCKS.CONSOLE.indexOf(char);
      if (idx !== -1) return this.BLOCKS.DEVICE[idx];
      else return char;
    };

    updateFieldsKeys.forEach((colNum, idx) => {
      const prevColNum = updateFieldsKeys[idx - 1];
      if (
        !(instructions === '') &&
        prevColNum &&
        parseInt(colNum) === parseInt(prevColNum) + 1
      ) {
        instructions += replaceUnicode(updateFieldsObj[colNum]);
      } else {
        instructions += '\\xFE\\x47'; // goto
        instructions += `\\x${pad(hex(colNum))}`; // x
        instructions += `\\x${pad(hex(rowNum))}`; // y
        instructions += replaceUnicode(updateFieldsObj[colNum]); // character
      }
    });

    return instructions;
  }

  linearToLog(ms) {
    let speed = ms > this.graphMaxPing ? this.graphMaxPing : ms;
    speed = 1 - (speed / this.graphMaxPing);
    return Math.abs(this.logScale.linearToLogarithmic(speed) - 7);
  }

  print(str) {
    shell.exec(`echo -ne "${str}" > ${this.device}`, { shell: '/bin/bash' }, (code, stdout, stderr) => {
      if (code) console.log('Exit code:', code);
      if (stdout) console.log('Program output:', stdout);
      if (stderr) console.log('Program stderr:', stderr);
    });
  }

  updateScreen(lineA, lineB) {
    const slicedLineA = lineA.slice(0,16);
    const slicedLineB = lineB.slice(0,16);

    if (!this.device) {
      console.log(`${slicedLineA}\n${slicedLineB}\n\n`); // eslint-disable-line no-console
      return;
    }

    const updateFieldsA = this.constructor.getUpdateFields(this.state.a, slicedLineA);
    const updateFieldsB = this.constructor.getUpdateFields(this.state.b, slicedLineB);
    const matrixInstructionsA = this.getMatrixInstructions(updateFieldsA, 0);
    const matrixInstructionsB = this.getMatrixInstructions(updateFieldsB, 1);

    this.print(matrixInstructionsA);
    this.print(matrixInstructionsB);
  }

  raster() {
    let graph = '';
    const plotGraph = () => {
      let str = '';
      this.graph.forEach(int => { str += this.BLOCKS.CONSOLE[int] });
      return str;
    }

    let scheme = '';
    if (this.downtime) {
      let down = parseInt((Date.now() - this.downtime) / 1000);
      down = this.constructor.formatTime(down);
      scheme = this.constructor.textAlign('right', 'Downtime:       ', down);
      graph = `[${plotGraph()}]`;
    } else {
      let up = parseInt((Date.now() - this.uptime) / 1000);
      up = this.constructor.formatTime(up);
      scheme = this.constructor.textAlign('right', '        |       ', up);
      scheme = this.constructor.textAlign('middle', scheme, `${this.lastEntry}ms`);
      if (this.prevDownDuration) {
        const formattedDownDur = this.constructor.formatTime(parseInt(this.prevDownDuration / 1000));
        const plottedGraph = plotGraph().slice(formattedDownDur.length);
        graph = `${formattedDownDur}[${plottedGraph}]`;
      } else {
        graph = `[${plotGraph()}]`;
      }
    }

    this.updateScreen(scheme, graph);
  }

  interpret(ms) {
    // if ping returned with 'no reply' or 'other errors'
    if (ms < 0) {
      ms = this.graphMaxPing; // don't update parameter
      this.downtime = this.downtime || Date.now();
      this.uptime = null;
      if (this.color !== 'red') {
        this.print('\\xFE\\xD0\\xff\\x00\\x00'); // change to red background
        this.color = 'red';
      }
    } else if (this.downtime) {
      if (this.color !== 'blue') {
        this.print('\\xFE\\xD0\\xff\\xff\\xff'); // restore blue (white) background
        this.color = 'blue';
      }
      this.prevDownDuration = this.prevUptime ? Date.now() - this.downtime : null;
      this.prevUptime = Date.now();
      this.downtime = null;
      this.uptime = Date.now();
    } else if (ms >= this.graphMaxPing && this.color !== 'yellow') {
      this.print('\\xFE\\xD0\\xff\\x4f\\x00'); // yellow background
      this.color = 'yellow';
    } else if (ms + (this.graphMaxPing/4) < this.graphMaxPing && this.color === 'yellow') {
      this.print('\\xFE\\xD0\\xff\\xff\\xff'); // restore blue (white) background
      this.color = 'blue';
    } else if (this.uptime) {
      this.prevUptime = Date.now();
    }

    const barLevel = this.linearToLog(ms); // 0-8
    this.graph.push(barLevel);
    this.graph.shift();
    this.lastEntry = ms;

    this.raster();
  }

  start(interval) {
    this.print('\\xFE\\xD0\\xff\\xff\\xff'); // restore blue (white) background
    this.print('\\xfe\\xc0\\x00'); // load custom bank 0;

    const newInterval = interval < 1000 ? 1000 : interval;
    const main = async () => {
      if (this.debounce) return;
      this.debounce = true;

      let localPing = null;
      if (this.checkLocalNetwork) localPing = await this.constructor.ping(this.checkLocalNetwork);
      const ping = await this.constructor.ping(this.checkDomain || 'google.com');
      
      this.debounce = false;
      if (localPing < 0) return; // if we are pinging the router, and it is down, dont even bother logging. Skip this cycle. (Useful for Pi Zero's spotty connections)
      this.interpret(ping);
    };

    main(); // first one to fill the screen asap
    this.clock = setInterval(main, newInterval);
  }

  stop() {
    clearInterval(this.clock);
  }

  // stateTracker(screenString) {
  //   /* Will have to mimic what the DisplayMatrix does and interpret it's codes
  //   as modification codes to the state */
  // }
}
