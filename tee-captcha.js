const express = require('express')
const app = express()
const dotenv = require('dotenv')
const fetch = require('node-fetch')
const fs = require('fs')
const Jimp = require('jimp')
const cron = require('node-cron')
const { response } = require('express')
dotenv.config()

const countSolutions = source =>
  fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dirent => dirent.name !== '.git')
    .filter(dirent => fs.existsSync(`./data/${dirent.name}/solution.json`))
    .map(dirent => dirent.name)

const port = 3578
const argAppend = process.argv[2] === '-a' ||
  process.argv[2] === '--append'
const argWrite = process.argv[2] === '-w' ||
  process.argv[2] === '--write' ||
  argAppend
let globalIndex = argAppend ? countSolutions('./data').length : 0
/*
  scoreCache

  key: hex(ip + host + token)
  value: {score: score, age: Date.now()}
*/
const scoreCache = {}

// wipe old cache every hour
cron.schedule('0 * * * *', function () {
  console.log('---------------------')
  console.log('Running Cron Job')
  console.log('Cleaning up score cache')
  const now = Date.now()
  const deleteKeys = []
  for (const [key, value] of Object.entries(scoreCache)) {
    const diff = now - value.age
    const diffHours = Math.floor((diff % 86400000) / 3600000)
    if (diffHours > 1) {
      console.log(`  delete key=${key} hours=${diffHours}`)
      deleteKeys.push(key)
    }
  }
  deleteKeys.forEach((key) => {
    delete scoreCache[key]
  })
  console.log('---------------------')
})

// Add headers
// https://stackoverflow.com/a/18311469
app.use(function (req, res, next) {
  // TODO: make this more dynamic and decide on a front end port (9090 for now)
  // Website you wish to allow to connect
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:9090')

  // Request methods you wish to allow
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')

  // Request headers you wish to allow
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type')

  // Set to true if you need the website to include cookies in the requests sent
  // res.setHeader('Access-Control-Allow-Credentials', true);

  // Pass to next layer of middleware
  next()
})

app.use(
  express.urlencoded({
    extended: true
  })
)

app.get('/style.css', (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/css' })
  fs.readFile('./static/style.css', 'utf8', (err, data) => {
    if (err) {
      response.end('error')
      return console.log(err)
    }
    response.end(
      data
        .replaceAll('placeholder-token', request.query.t)
        .replaceAll('180', request.query.w || '180')
        .replaceAll('101', request.query.h || '101')
    )
  })
})

const xmur3 = (str) => {
  let i, h
  for (i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = h << 13 | h >>> 19
  }
  h = Math.imul(h ^ h >>> 16, 2246822507)
  h = Math.imul(h ^ h >>> 13, 3266489909)
  return (h ^= h >>> 16) >>> 0
}

const getDirectories = source =>
  fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dirent => dirent.name !== '.git')
    .map(dirent => dirent.name)

const getImgIndex = token => {
  const numImages = getDirectories(require('path').resolve(__dirname, './data')).length
  // TODO: salt token with server secret to have some spicy security
  return xmur3(token) % numImages
}

/*
const randInt = (min, max) => {
  return Math.floor(
    Math.random() * (max - min) + min
  )
}
*/

const randFloat = (min, max) => {
  return Math.random() * (max - min) + min
}

app.get('/*.png', (request, response) => {
  const imgIndex = argWrite ? globalIndex : getImgIndex(request.query.t)
  // console.log(`picked image ${imgIndex} out of ${numImages} (rand=${randVal} token=${request.query.t})`)
  response.writeHead(200, { 'Content-Type': 'image/gif' })
  Jimp.read(`./data/${imgIndex}${request.originalUrl.split('?')[0]}`, (err, img) => {
    if (err) throw err

    img
      .brightness(randFloat(-0.1, 0.1))
      .getBuffer(Jimp.MIME_PNG, (err, buffer) => {
        if (err) throw err

        response.end(buffer, 'binary')
      })
  })
})

app.get('/', (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  fs.readFile('./index.html', 'utf8', (err, data) => {
    if (err) {
      response.end('error')
      return console.log(err)
    }
    response.end(
      data
        .replaceAll('placeholder-token', request.query.t)
        .replaceAll('placeholder-callback', request.query.callback)
        .replaceAll('query-ip', request.query.ip)
        .replaceAll('query-w', request.query.w || '180')
        .replaceAll('query-h', request.query.h || '101')
    )
  })
})

app.get('/score/:key', (req, res) => {
  const hexKey = req.params.key
  res.send(JSON.stringify(scoreCache[hexKey] || [null, null]))
  if (!scoreCache[hexKey]) {
    console.log(`Warning invalid score requested key=${hexKey}`)
    const decode = Buffer.from(hexKey, 'hex').toString('utf8')
    console.log(`  key: ${hexKey}`)
    console.log(`  key (decoded): ${decode}`)
    console.log('  valid keys:')
    console.log(Object.keys(scoreCache))
    console.log('  valid keys (decode):')
    console.log(Object.keys(scoreCache).map(k => Buffer.from(k, 'hex').toString('utf8')))
  } else {
    delete scoreCache[hexKey]
  }
})

const sendScore = (req, callbackUrl, token, score, serverIp) => {
  // ipAddr should be the ip of the server with the form
  // it is user controlled and messy so it could be empty/wrong
  // if empty we fallback to own ip (WHICH DOES NOT MAKE MUCH SENSE lul)
  //
  // but even if this ip is wrong the captcha still works
  // just the firewall bypass check score feature does not anymore
  const ipAddr = (serverIp || req.query.ip || req.header('x-forwarded-for') || req.socket.remoteAddress).split(',')[0]
  const ownIpAddr = (req.header('x-forwarded-for') || req.socket.remoteAddress).split(',')[0]
  console.log(`sending score to ipAddr=${ipAddr} from=${ownIpAddr} url='${callbackUrl}' token='${token}' score=${score}`)
  const hexKey = Buffer.from(ipAddr + callbackUrl + token, 'utf8').toString('hex')
  scoreCache[hexKey] = { score, age: Date.now() }

  if(!callbackUrl) {
    console.warn('WARNING: got request without callbackUrl!')
    return
  }

  console.log(`fetching callback: ${callbackUrl}`)

  fetch(callbackUrl, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      score
    })
  })
}

app.post('/', (request, response) => {
  const { token, w, h, ip } = request.body
  const callbackUrl = request.body.callback
  const attempt = typeof request.body.captcha === 'string' ? [request.body.captcha] : request.body.captcha === undefined ? [] : request.body.captcha
  response.writeHead(200, { 'Content-Type': 'text/html' })
  if (argWrite) {
    fs.writeFile(`./data/${globalIndex}/solution.json`, JSON.stringify(attempt), err => {
      if (err) {
        console.log(err)
      }
    })
    globalIndex++
    response.end(`next <br><a href="/?t=${token}&callback=${callbackUrl}">back</a>`)
    return
  }
  fs.readFile(`./data/${getImgIndex(token)}/solution.json`, 'utf8', (err, data) => {
    if (err) {
      console.log(err)
      return
    }
    const solution = JSON.parse(data)
    // console.log(`attempt=${attempt}`)
    // console.log(`solution=${solution}`)
    if (attempt.length === solution.length && attempt.every((value, index) => value === solution[index])) {
      sendScore(request, callbackUrl, token, 1, ip)
      response.end(
        `
        <html>
        <img alt="success" src="human.svg" style="height: calc(${h * 4}px + 2em);margin-top: 1em;"></svg><br>
        henlo hooman!
        </html>`
      )
    } else {
      sendScore(request, callbackUrl, token, 0, ip)
      response.end(
        `<html>
        <img alt="failure" src="robot.svg" style="height: calc(${h * 4}px + 2em);margin-top: 1em;"></svg><br>
        Are you a robot?<br><a href="/?t=${token}&callback=${callbackUrl}&w=${w}&h=${h}&ip=${ip}">try again</a>
        </html>`
      )
    }
  })
})

app.use(express.static('static'))

app.listen(port, () => {
  console.log(`App running on http://localhost:${port}. ${argWrite ? '[write mode]' : ''}`)
})
