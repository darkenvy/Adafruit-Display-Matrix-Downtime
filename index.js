const shell = require('shelljs');
const LogScale = require('log-scale');

// -------------------------------------------------------------------------- //
/* TODO: 
  program 8 bars into display
  finish state diff change code.
*/


module.exports = class DisplayMatrix {
  constructor() {
    this.device = null;
    this.prevUptime = null; // used for determining if ever been up to begin with.
    this.logScale = new LogScale(0, 8);
    this.graphMaxPing = 1000;

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
    this.BLOCKS = ['_', '▁','▂','▃','▄','▅','▆','▇','█'];
    this.graph = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    this.lastEntry = 0;

    // setInterval components
    this.debounce = false;
    this.clock = null;

    // state for minimizing updates
    this.state; // TODO:
  }

  static ping(callback) {
    if (!callback) return;
    let result = this.graphMaxPing;

    shell.exec('ping -c 1 -t 10 1.1.1.1 | grep "time="', { silent: true }, (code, stdout, stderr) => {
      // timeout or error
      if (code) {
        callback(0 - code);
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

      callback(result);
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

  linearToLog(ms) {
    let speed = ms > this.graphMaxPing ? this.graphMaxPing : ms;
    speed = 1 - (speed / this.graphMaxPing);
    return Math.abs(this.logScale.linearToLogarithmic(speed) - 8);
  }

  command(cmd, params) {
    const str = this.CODES.PREFIX + cmd + (params || []).join('');
    shell.exec(`echo "${str}" > ${this.device}`, (code, stdout, stderr) => {
      if (code) console.log('Exit code:', code);
      if (stdout) console.log('Program output:', stdout);
      if (stderr) console.log('Program stderr:', stderr);
    });
  }

  plotGraph(isShort) {
    let str = '';
    this.graph.forEach(int => { str += this.BLOCKS[int] });
    return str;
  }

  updateScreen(line1, line2) {
    if (!this.device) {
      console.log(`${line1}\n${line2}\n\n`);
      return;
    }
  }

  raster() {
    let graph = '';

    let scheme = '';
    if (this.downtime) {
      let down = parseInt((Date.now() - this.downtime) / 1000);
      down = this.constructor.formatTime(down);
      scheme = this.constructor.textAlign('right', 'Downtime:       ', down);
      graph = `[${this.plotGraph()}]`;
    }
    else {
      let up = parseInt((Date.now() - this.uptime) / 1000);
      up = this.constructor.formatTime(up);
      scheme = this.constructor.textAlign('right', '        |       ', up);
      scheme = this.constructor.textAlign('middle', scheme, `${this.lastEntry}ms`);
      if (this.prevDownDuration) {
        const formattedDownDur = this.constructor.formatTime(parseInt(this.prevDownDuration / 1000));
        const plottedGraph = this.plotGraph().slice(formattedDownDur.length);
        graph = `${formattedDownDur}[${plottedGraph}]`;
      } else {
        graph = `[${this.plotGraph()}]`;
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
    } else if (this.downtime) {
      this.prevDownDuration = this.prevUptime ? Date.now() - this.downtime : null;
      this.prevUptime = Date.now();
      this.downtime = null;
      this.uptime = Date.now();
    }

    const barLevel = this.linearToLog(ms); // 0-8
    this.graph.push(barLevel);
    this.graph.shift();
    this.lastEntry = ms;

    this.raster();
  }

  start(interval) {
    const newInterval = interval < 1000 ? 1000 : interval;
    this.clock = setInterval(() => {
      if (this.debounce) return;
      this.debounce = true;

      this.constructor.ping(ms => {
        this.interpret(ms);
        this.debounce = false;
      });
    }, newInterval);
  }

  stop() {
    clearInterval(this.clock);
  }
}
