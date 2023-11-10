const childprocess = require('child_process')
const { parentPort } = require('worker_threads');


parentPort.on('message', (data) => {
    childprocess.execSync(data, {stdio:'inherit'})
    parentPort.postMessage('👌🏻')
})