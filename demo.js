const DisplayMatrix = require('./');

const display = new DisplayMatrix();
display.device = '/dev/cu.usbmodem14541';
display.start(1000);
