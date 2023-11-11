import fs from 'fs'
import json from './collection-bangladesh.json' assert {type: 'json'}
import childproc from 'node:child_process'
import chalk from 'chalk'
import boxen from 'boxen'
import htmlToAnsi from 'html-to-ansi'
import stripAnsi from 'strip-ansi'
import soundplay from 'sound-play'
import anyAscii from 'any-ascii'
import { platform } from 'os'
import {Worker} from 'node:worker_threads'
import { promisify } from 'util'

const WorkerPlaySound = new Worker('./sync-worker.cjs')
const WorkerMakeSound = new Worker('./sync-worker.cjs')

const IMAGE_DOMAIN = 'https://images.prothomalo.com/'
const print = console.log
const printBoxen = (msg:string) => print(boxen(msg, { borderStyle: 'none', backgroundColor: 'yellow', padding: 1 }))
/*
const execAsync = (cmd:string, opts:any) => new Promise((resolve, reject) => {
    const c = childproc.exec(cmd, (err, stdout, stderr)=> {
        if (stdout)  resolve(stdout)
        if (stderr) reject(stderr)
        if (err) reject (err)
    })
})*/
//const execAsync = promisify(childproc.exec)
//const spawnAsync = promisify(childproc.spawn)

/**
 * In this design, the public function `this.startMakingAudio()`
 * is invoked after the `this.arr` is filled up. That public function
 * will keep making audio in sequence.
 * 
 * When the first audio is ready, that public function will start
 * playing the audio files. 
 * 
 * So play of the audio and making of the audio are async and simultaneous!
 */
class Manager {
    constructor() {}

    public makeAudioArr:string[] = []

    public playingStarted =false

    private makingStarted=false

    private getArrLength() {
        const l =this.makeAudioArr.length
        print('getArrLength:', l)
        return l
    }

    private async makeAudioAsync(id:string) {
        //return makeAudio(id)

        const cmd = 'python3 ./text-to-speech.py '+id
        WorkerMakeSound.postMessage(cmd)
        await new Promise((resolve, reject) => WorkerMakeSound.once('message', resolve))
        console.log('done making audio of ', id)
        //return childproc.execSync(, {stdio:'inherit'})
    }

    // idempotent
    public async startMakingAudio() {
        if (this.makingStarted) throw Error('making already started bro')
        this.makingStarted = true

        while (this.getArrLength()) {
            const item = this.makeAudioArr.shift()
            if (!item) throw Error('not supposed to give undefined')
            await this.makeAudioAsync(item)
            this.playReadyArr.push(item)
            console.log({playingStarted: this.playingStarted})

            if (!this.playingStarted) 
                this.startPlayingAudio()
            
        }
        WorkerMakeSound.terminate()
    }

    public playReadyArr:string[] = []

    private getPlayReadyLength() {
        const l =this.playReadyArr.length
        print('length of this.playReadyArr:', l)
        return l
    }

    // idempotent
    public async startPlayingAudio() {
        if (this.playingStarted) throw Error('play already started bro')
        this.playingStarted = true
        print('playingStarted = true')

        while (this.getPlayReadyLength()) {
            const item = this.playReadyArr.shift()
            const filename = `./audio-digest/${item}.wav`
            const cmd = `powershell "@($s = New-Object System.Media.SoundPlayer; $fullpath = resolve-path '${filename}'; $s.soundlocation = $fullpath; $s.playsync())"` 
            
            //childproc.execSync(cmd, {stdio:'inherit'})
            //worker.postMessage({type:'play', data:filename})
            WorkerPlaySound.postMessage(cmd)
            await new Promise((resolve, reject) => WorkerPlaySound.once('message', resolve))
            print('done playing audio from startPlayingAudio')
            //playAudio(filename)
        }
        this.playingStarted = false
        print('playStarted = false')

        if (!this.getPlayReadyLength() && !this.getArrLength()) {
            WorkerPlaySound.terminate()
        }
    }
}

const manager = new Manager()

for (const item of json.items) {
    if (item.story.subheadline) print(item.story.subheadline)
    printBoxen(item.story.headline.replace(/\n/g, ''))
    print(new Date(item.story['created-at']).toLocaleString('bn'))
    print('\n')

    for (const card of item.story.cards) {
        for (const storyElement of card['story-elements']) {
            let text=''
            switch (storyElement.type) {
                case "image":
                    // @ts-ignore
                    const url = IMAGE_DOMAIN + storyElement['image-s3-key'];
                    // @ts-ignore
                    const { width: wi, height: hi } = storyElement['image-metadata'];
                    const ri = wi / hi
                    const [ws, hs] = [process.stdout.columns, process.stdout.rows]
                    const rs = ws / hs
                    //const [scaledWidth, scaledHeight] = rs > ri ?  [ws, hi * ws/wi]:[wi * hs/hi, hs]
                    const [scaledWidth, scaledHeight] = rs > ri ? [wi * hs / hi, hs] : [ws, hi * ws / wi]
                    const cmd = `powershell ./render-image.ps1 -Path ${url} -width ${scaledWidth} -height ${scaledHeight}"`
                    //childproc.execSync(cmd, { stdio: 'inherit' })
                    break
                case 'text':
                    const t = htmlToAnsi(storyElement.text) + '\n'
                    text += t
                    //print(t)
                    break
                case 'title':
                    const ti = htmlToAnsi(storyElement.text) + '\n'
                    text += ti
                    //print(chalk.bold.underline(ti))
                    break
                default:
                    print(new Error(`Couldn't render story-element of type: ${storyElement.type}`))
                    break

            }

            // Making an audio txt file and wav file per paragraph of text!
            if (!text) continue;

            
            const baseFilename = `./audio-digest/${storyElement.id}`
            const txtFile = baseFilename+'.txt'
            const wavFile = baseFilename+'.wav'
            if (!await fileFound(txtFile)) {
                await fs.promises.writeFile(txtFile, text)
            }
            if (!await fileFound(wavFile)) {
                manager.makeAudioArr.push(storyElement.id)
                //makeAudio(storyElement.id) //old
            }
            else {
                print('found audio')
                
                manager.playReadyArr.push(storyElement.id)
                if (!manager.playingStarted) manager.startPlayingAudio()

            }
            //articleAudioList.push(storyElement.id)
        }
    }

    //break // test: just one 🧪
    print('\n\n\n')
}


manager.startMakingAudio()
if (!manager.playingStarted) manager.startPlayingAudio()



function fileFound(filename:string) {
    return fs.promises.access(filename).then(_ => true).catch(_ => false)
}

/*
function makeAudio(id:string) {
    print('making audio')
    //childproc.spawnSync('python3', ['./text-to-speech.py', id], {stdio:'inherit'})
    return childproc.execSync('python3 ./text-to-speech.py '+id, {stdio: 'inherit'})
}

function playAudio(filename:string) {
    const cmd = `powershell "@($s = New-Object System.Media.SoundPlayer; $fullpath = resolve-path '${filename}'; $s.soundlocation = $fullpath; $s.playsync())"`
    return childproc.execSync(cmd, {stdio: 'inherit'})
}

function stripNonAsciiChars(str:string) {
    return stripAnsi(str).replace(/[^ -~]+/g, "");
}*/