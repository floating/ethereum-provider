const consoleLog = console.log
const consoleDebug = console.debug
const consoleError = console.error

exports.mochaHooks = {
  beforeAll () {
    console.log = () => {}
    console.debug = () => {}
    console.error = () => {}
  },
  afterAll () {
    console.log = consoleLog
    console.debug = consoleDebug
    console.error = consoleError
  }
}
