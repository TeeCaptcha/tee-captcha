const express = require('express')
const app = express()
const dotenv = require('dotenv')
const fetch = require('node-fetch')
const fs = require('fs')
dotenv.config()

const port = 3578

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

// app.use(express.static('static'))

app.get('/style.css', (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' })
  fs.readFile('./static/style.css', 'utf8', (err, data) => {
    if (err) {
      response.end('error')
      return console.log(err)
    }
    response.end(
      data
        .replaceAll('placeholder-token', request.query.t)
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

const { readdirSync } = require('fs')

const getDirectories = source =>
  readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

app.get('/*.png', (request, response) => {
  const numImages = getDirectories(require('path').resolve(__dirname, './data')).length
  const randVal = xmur3(request.query.t)
  const imgIndex = randVal % numImages
  console.log(`picked image ${imgIndex} out of ${numImages} (rand=${randVal} token=${request.query.t})`)
  response.writeHead(200, { 'Content-Type': 'image/gif' })
  fs.readFile(`./data/${imgIndex}${request.originalUrl.split('?')[0]}`, (err, data) => {
    if (err) {
      response.end('error')
      return console.log(err)
    }
    response.end(data, 'binary')
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
    )
  })
})

const sendScore = (callbackUrl, token, score) => {
  fetch(callbackUrl, {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token: token,
      score: score
    })
  })
}

app.post('/', (request, response) => {
  const { token } = request.body
  const callbackUrl = request.body.callback
  const attempt = typeof request.body.captcha === 'string' ? [request.body.captcha] : request.body.captcha === undefined ? [] : request.body.captcha
  const solution = ['cb-1-2']
  console.log(attempt)
  console.log(solution)
  response.writeHead(200, { 'Content-Type': 'text/html' })
  if (attempt.length === solution.length && attempt.every((value, index) => value === solution[index])) {
    sendScore(callbackUrl, token, 1)
    response.end(`you are hooman <br><a href="/?t=${token}&callback=${callbackUrl}">back</a>`)
  } else {
    sendScore(callbackUrl, token, 0)
    response.end(`try again <br><a href="/?t=${token}&callback=${callbackUrl}">back</a>`)
  }
})

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
})
