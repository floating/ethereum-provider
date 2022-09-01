// const consoleLog = console.log
const consoleDebug = console.debug
const consoleError = console.error

export default {
  mochaHooks: {
    beforeAll () {
      // console.log = () => {}
      console.debug = () => {}
      console.error = () => {}
    },
    afterAll () {
      // console.log = consoleLog
      console.debug = consoleDebug
      console.error = consoleError
    }
  }
}
