const DisplayMatrix = require('./');

const display = new DisplayMatrix();
display.device = '/dev/ttyACM0'; // what it shows up on the Pi.
display.start(15000);
