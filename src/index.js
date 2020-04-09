#! /usr/bin/env node

require('colors')
const fs = require('fs')
const argv = require('commander')
const ProgressBar = require('progress')
const dateFormat = require('dateformat')
const ffmpeg = require('fluent-ffmpeg')
const { version } = require('../package.json')

const isMain = require.main === module
let seedFile, onlineFile, offlineFile, duplicatesFile, bar

if (isMain) {
  argv
    .version(version, '-v, --version')
    .name('iptv-checker')
    .description(
      'Utility to check .m3u playlists entries. If no file path or url is provided, this program will attempt to read stdin'
    )
    .usage('[options] [file-or-url]')
    .option('-o, --output [output]', 'Path to output directory')
    .option(
      '-t, --timeout [timeout]',
      'Set the number of milliseconds for each request',
      60000
    )
    .option(
      '-k, --insecure',
      'Allow insecure connections when using SSL',
      false
    )
    .option('-d, --debug', 'Toggle debug mode')
    .action(function (file = null) {
      seedFile = file
    })
    .parse(process.argv)
  const outputDir =
    argv.output || `iptv-checker-${dateFormat(new Date(), 'd-m-yyyy-hh-MM-ss')}`
  onlineFile = `${outputDir}/online.m3u`
  offlineFile = `${outputDir}/offline.m3u`
  duplicatesFile = `${outputDir}/duplicates.m3u`

  try {
    fs.lstatSync(outputDir)
  } catch (e) {
    fs.mkdirSync(outputDir)
  }

  fs.writeFileSync(onlineFile, '#EXTM3U\n')
  fs.writeFileSync(offlineFile, '#EXTM3U\n')
  fs.writeFileSync(duplicatesFile, '#EXTM3U\n')
}

async function init(
  src = seedFile,
  {
    timeout = +argv.timeout || 60000,
    insecure = argv.insecure || false,
    debug = argv.debug || false,
  }
) {
  let items
  const stats = {
    total: 0,
    online: 0,
    offline: 0,
    duplicates: 0,
  }
  const config = {
    debug,
    timeout,
    insecure,
    isMain,
  }
  const helper = require('./helper')

  const { addToCache, checkCache, parseMessage } = helper

  const writeToFile = helper.writeToFile.bind(config)
  const debugLogger = helper.debugLogger(debug)

  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = !+insecure

  if (isMain) console.time('Execution time')

  try {
    if (!Array.isArray(src)) {
      ;({ items } = await helper.parsePlaylist(src))
    } else {
      items = src
    }

    stats.total = items.length

    debugLogger(`Checking ${stats.total} items...`)

    bar = isMain && new ProgressBar(':bar', { total: stats.total })

    let checkedItems = []

    for (let item of items) {
      if (!debug && isMain) {
        bar.tick()
      }

      if (!item.url) continue

      if (checkCache(item)) {
        writeToFile(duplicatesFile, item)

        stats.duplicates++

        continue
      }

      addToCache(item)

      let checkedItem = await validateStatus(item)

      if (!isMain) checkedItems.push(checkedItem)
    }

    if (config.debug && isMain) {
      console.timeEnd('Execution time')
    }

    const result = [
      `Total: ${stats.total}`,
      `Online: ${stats.online}`.green,
      `Offline: ${stats.offline}`.red,
      `Duplicates: ${stats.duplicates}`.yellow,
    ].join('\n')

    if (isMain) {
      console.log(`\n${result}`)
      return process.exit(0)
    } else {
      return checkedItems
    }
  } catch (err) {
    if (isMain) {
      console.error(err)
      process.exit(1)
    } else throw err
  }

  function validateStatus(item) {
    let { url } = item
    return new Promise(resolve => {
      ffmpeg(url, { timeout: parseInt(timeout / 1000) }).ffprobe(function (
        err,
        metadata
      ) {
        let result = {
          ...item,
          status: { ok: null, checked: Date.now(), timeout, metadata },
        }
        if (err) {
          result.status.ok = false
          const message = String(parseMessage(err, url))
          result.status.reason = message

          writeToFile(offlineFile, item, message)

          debugLogger(`${url} (${message})`.red)

          stats.offline++
        } else {
          result.status.ok = true
          debugLogger(`${url}`.green)

          writeToFile(onlineFile, item)

          stats.online++
        }
        resolve(result)
      })
    })
  }
}

if (isMain) {
  init()
} else {
  module.exports = init
}
