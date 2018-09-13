const DisplayMatrix = require('./');

const display = new DisplayMatrix();
display.device = '/dev/ttyACM0'; // what it shows up on the Pi.
display.checkDomain = '1.1.1.1';
display.start(5000);
// display.start(15000);
