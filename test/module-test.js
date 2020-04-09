const iptvChecker = require('../src/index.js')
const testItems = require('./test-items.json')
const url = `https://iptv-org.github.io/iptv/categories/legislative.m3u`
const sampleSize = require('lodash.samplesize')

async function test(src) {
  return await iptvChecker(src, {
    debug: false,
    timeout: 2000,
  })
}
Promise.all([test(testItems), test(url)])
  .then(arr => arr.flat())
  .then(arr => sampleSize(arr, 5))
  .then(arr => console.log(JSON.stringify(arr, null, 1)))
