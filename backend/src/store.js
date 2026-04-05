const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const storePath = path.join(__dirname, '..', 'data', 'store.json')

function readStore() {
  const content = fs.readFileSync(storePath, 'utf-8')
  return JSON.parse(content)
}

function writeStore(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8')
}

function createId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

module.exports = {
  readStore,
  writeStore,
  createId,
}
