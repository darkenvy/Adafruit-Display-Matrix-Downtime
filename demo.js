const DisplayMatrix = require('./');

const display = new DisplayMatrix();
display.device = '/dev/ttyACM0'; // what it shows up on the Pi.
display.checkLocalNetwork = '10.0.0.1';
display.checkDomain = 'google.com';
display.start(1000);
// display.start(15000);
