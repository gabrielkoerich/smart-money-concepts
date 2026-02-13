import util from 'util'

util.inspect.defaultOptions.depth = null
util.inspect.defaultOptions.maxArrayLength = null

const log = console.log

export const debug = process.env.DISABLE_DEBUG === 'true' ? () => {} : log

export const disableConsoleLog = () => {
    console.log = () => {}
}

export const enableConsoleLog = () => {
    console.log = log
}

export const mochaHooks = () => ({
    beforeAll() {
        disableConsoleLog()
    },
    afterAll() {
        enableConsoleLog()
    },
})

export async function mochaGlobalSetup() {
    disableConsoleLog()
}

export async function mochaGlobalTeardown() {
    enableConsoleLog()
}
