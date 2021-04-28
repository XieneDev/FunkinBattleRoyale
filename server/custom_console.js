// https://stackoverflow.com/questions/41464526/handling-nodejs-input-while-outputting/41670476

const blessed = require('blessed');

var screen = blessed.screen({
	smartCSR: true
});
var body = blessed.box({
  top: 0,
  left: 0,
  height: '100%-1',
  width: '100%',
  keys: true,
  vi: true,
  mouse: true,
  alwaysScroll: true,
  scrollable: true,
  scrollbar: {
    ch: ' ',
    bg: 'red'
  }
});
var inputBar = blessed.textbox({
  bottom: 0,
  left: 0,
  height: 1,
  width: '100%',
  keys: true,
  mouse: true,
  inputOnFocus: true,
  style: {
    fg: 'white',
    bg: 'blue'  // Blue background so you see this is different from body
  }
});

// Add body to blessed screen
screen.append(body);
screen.append(inputBar);


screen.key(['escape', 'C-c'], (ch, key) => (process.exit(0)));

const custom_console = {};

custom_console.handle = function(input) {}

// Handle submitting data
inputBar.on('submit', (text) => {
  custom_console.handle(text);
  inputBar.focus();
  inputBar.clearValue();
  screen.render();
});
inputBar.focus();

// Add text to body (replacement for console.log)
function log(text) {
  body.pushLine(text);
  screen.render();
}
custom_console.log = log;


// Listen for enter key and focus input then
screen.key('enter', (ch, key) => {
  inputBar.focus();
});

module.exports = custom_console;
