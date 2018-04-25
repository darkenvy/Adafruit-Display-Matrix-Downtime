const shell = require('shelljs');
const child_process = require('child_process');
const LogScale = require('log-scale');

const device = '/dev/cu.usbmodem14541';
const logScale = new LogScale(0, 8);
const maxPing = 2000;

// -------------------------------------------------------------------------- //

class DisplayMatrix {
  constructor() {
    this.CODES = {
      PREFIX: '\\xFE',
      NEWLINE: '\\x0A',
      CLEAR: '\\x58',
      POS: '\\x47', //cursor position x,y
      COLOR: '\\xD0',
    }

    this.BLOCKS = [' ', '▁','▂','▃','▄','▅','▆','▇','█'];
    this.graph = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

    setInterval(() => {
      const rand = parseInt(Math.random() * 8);
      this.graph.push(rand);
      this.graph.shift();

      this.mockGraph()
    }, 1000);
  }

  static linearToLog(ms) {
    let speed = ms > maxPing ? maxPing : ms;
    speed = 1 - (speed / maxPing);
    return Math.abs(logScale.linearToLogarithmic(speed) - 8);
  }

  static ping(callback) {
    if (!callback) return;
    let result = null;

    shell.exec('ping -c 1 -t 10 google.com | grep "time="', { silent: true }, (code, stdout, stderr) => {
      if (code || stderr) return;

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

  command(cmd, params) {
    const str = this.CODES.PREFIX + cmd + (params || []).join('');
    shell.exec(`echo "${str}" > ${device}`, (code, stdout, stderr) => {
      if (code) console.log('Exit code:', code);
      if (stdout) console.log('Program output:', stdout);
      if (stderr) console.log('Program stderr:', stderr);
    });
  }

  mockGraph() {
    let str = '';
    this.graph.forEach(int => {
      str += this.BLOCKS[int];
    });
    console.log(str);
  }

}

// -------------------------------------------------------------------------- //

const display = new DisplayMatrix();

