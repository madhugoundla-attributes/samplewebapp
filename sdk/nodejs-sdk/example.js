'use strict'

const express = require('express')
const http = require('http')
const bodyParser = require('body-parser')
const readline = require('readline')
const fs = require('fs')
const sdk = require('./src/index')
const Spinner = require('cli-spinner').Spinner
const QRCode = require('qrcode')

const LISTENING_PORT = 4000
const CONFIG_PATH = 'verity-context.json'
const INSTITUTION_NAME = 'Faber College'
const LOGO_URL = 'http://robohash.org/235'
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const handlers = new sdk.Handlers()
let listener

let context
let issuerDID
let issuerVerkey

async function example () {
  await setup()

  const forDID = await createConnection()

  //  await askQuestion(forDID)

  const schemaId = await writeLedgerSchema()
  const defId = await writeLedgerCredDef(schemaId)

  await issueCredential(forDID, defId)

  await requestProof(forDID)
}

//* ***********************
//       CONNECTION
//* ***********************
async function createConnection () {
  // Connecting protocol has to steps
  // 1. Start the protocol and receive the invite
  // 2. Wait for the other participant to accept the invite

  // Step 1

  // Constructor for the Connecting API
  const connecting = new sdk.protocols.Connecting(null, uuidv4(), null, true)
  var spinner = new Spinner('Waiting to start connection ... %s').setSpinnerDelay(450) // Console spinner

  // handler for the response to the request to start the Connecting protocol.
  var firstStep = new Promise((resolve) => {
    handlers.addHandler(connecting.msgFamily, connecting.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case connecting.msgNames.INVITE_DETAIL:
          spinner.stop()
          printMessage(msgName, message)
          var invite = message.inviteDetail
          var relDID = invite.senderDetail.DID
          var truncatedInvite = sdk.utils.truncateInviteDetailKeys(invite)

          await QRCode.toFile('qrcode.png', truncatedInvite)

          console.log()
          console.log('QR code at: qrcode.png')

          resolve(relDID)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })

  spinner.start()
  // starts the connecting protocol
  await connecting.connect(context)
  const forDID = await firstStep // wait for response from verity application

  // Step 2

  spinner = new Spinner('Waiting for Connect.Me to accept connection ... %s').setSpinnerDelay(450) // Console spinner
  // handler for the accept message sent when connection is accepted
  var secondStep = new Promise((resolve) => {
    handlers.addHandler(connecting.msgFamily, connecting.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case connecting.msgNames.CONN_REQ_ACCEPTED:
          spinner.stop()
          printMessage(msgName, message)
          resolve(null)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })

  spinner.start()
  await secondStep // wait for acceptance from connect.me user
  return forDID // return owning DID for the connection
}

//* ***********************
//        QUESTION
//* ***********************
//  async function askQuestion (forDID) {
//  const questionText = 'Hi Alice, how are you today?'
//  const questionDetail = 'Checking up on you today.'
//  const validAnswers = ['Great!', 'Not so good.']
//
//  const committedAnswer = new sdk.protocols.CommittedAnswer(forDID, null, questionText, null, questionDetail, validAnswers, true)
//  var spinner = new Spinner('Waiting for Connect.Me to answer the question ... %s').setSpinnerDelay(450) // Console spinner
//
//  var firstStep = new Promise((resolve) => {
//    handlers.addHandler(committedAnswer.msgFamily, committedAnswer.msgFamilyVersion, async (msgName, message) => {
//      switch (msgName) {
//        case committedAnswer.msgNames.ANSWER_GIVEN:
//          spinner.stop()
//          printMessage(msgName, message)
//
//          resolve(null)
//          break
//        default:
//          printMessage(msgName, message)
//          nonHandle('Message Name is not handled - ' + msgName)
//      }
//    })
//  })
//  spinner.start()
//  await committedAnswer.ask(context)
//  return firstStep
//  }

//* ***********************
//        SCHEMA
//* ***********************
async function writeLedgerSchema () {
  // input parameters for schema
  const schemaName = 'Diploma ' + uuidv4().substring(0, 8)
  const schemaVersion = '0.1'
  const schemaAttrs = ['name', 'degree']

  // constructor for the Write Schema protocol
  const schema = new sdk.protocols.WriteSchema(schemaName, schemaVersion, schemaAttrs)
  var spinner = new Spinner('Waiting to write schema to ledger ... %s').setSpinnerDelay(450) // Console spinner

  // handler for message received when schema is written
  var firstStep = new Promise((resolve) => {
    handlers.addHandler(schema.msgFamily, schema.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case schema.msgNames.STATUS:
          spinner.stop()
          printMessage(msgName, message)

          resolve(message.schemaId)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })

  spinner.start()
  // request schema be written to ledger
  await schema.write(context) // wait for operation to be complete
  return firstStep // returns ledger schema identifier
}

//* ***********************
//        CRED DEF
//* ***********************
async function writeLedgerCredDef (schemaId) {
  // input parameters for cred definition
  const credDefName = 'Trinity College Diplomas'
  const credDefTag = 'latest'

  // constructor for the Write Credential Definition protocol
  const def = new sdk.protocols.WriteCredentialDefinition(credDefName, schemaId, credDefTag)
  var spinner = new Spinner('Waiting to write cred def to ledger ... %s').setSpinnerDelay(450) // Console spinner

  // handler for message received when schema is written
  var firstStep = new Promise((resolve) => {
    handlers.addHandler(def.msgFamily, def.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case def.msgNames.STATUS:
          spinner.stop()
          printMessage(msgName, message)

          resolve(message.credDefId)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })

  spinner.start()
  // request the cred def be writen to ledger
  await def.write(context) // wait for operation to be complete and returns ledger cred def identifier
  return firstStep
}

//* ***********************
//         ISSUE
//* ***********************
async function issueCredential (forDID, defId) {
  // input parameters for issue credential
  const credentialName = 'Degree'
  const credentialData = {
    name: 'Joe Smith',
    degree: 'Bachelors'
  }

  // constructor for the Issue Credential protocol
  const issue = new sdk.protocols.IssueCredential(forDID, null, credentialName, credentialData, defId)
  var spinner = new Spinner('Wait for Connect.me to accept the Credential Offer ... %s').setSpinnerDelay(450) // Console spinner

  // handler for 'ask_accept` message when the offer for credential is accepted
  var firstStep = new Promise((resolve) => {
    handlers.addHandler(issue.msgFamily, issue.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case issue.msgNames.ASK_ACCEPT:
          spinner.stop()
          printMessage(msgName, message)

          resolve(null)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })

  spinner.start()
  // request that credential is offered
  await issue.offerCredential(context)
  await firstStep // wait for connect.me user to accept offer

  // request that credential be issued
  await issue.issueCredential(context)
  return sleep(3000) // Wait a few seconds for the credential to arrive before sending the proof
}

//* ***********************
//         PROOF
//* ***********************
async function requestProof (forDID) {
  // input parameters for request proof
  const proofName = 'Proof of Degree' + uuidv4().substring(0, 8)
  const proofAttrs = [
    {
      name: 'name',
      restrictions: [{ issuer_did: issuerDID }]
    },
    {
      name: 'degree',
      restrictions: [{ issuer_did: issuerDID }]
    }
  ]

  // constructor for the Present Proof protocol
  const proof = new sdk.protocols.PresentProof(forDID, null, proofName, proofAttrs)
  var spinner = new Spinner('Waiting for proof presentation from Connect.me ... %s').setSpinnerDelay(450) // Console spinner

  // handler for the result of the proof presentation
  var firstStep = new Promise((resolve) => {
    handlers.addHandler(proof.msgFamily, proof.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case proof.msgNames.PROOF_RESULT:
          spinner.stop()
          printMessage(msgName, message)

          resolve(null)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })
  spinner.start()

  // request proof
  await proof.request(context)
  return firstStep // wait for connect.me user to present the requested proof
}

//* ***********************
//         SETUP
//* ***********************
async function setup () {
  if (fs.existsSync(CONFIG_PATH)) {
    if (await readlineYesNo('Reuse Verity Context (in ' + CONFIG_PATH + ')', true)) {
      context = await loadContext(CONFIG_PATH)
    } else {
      context = await provisionAgent()
    }
  } else {
    context = await provisionAgent()
  }

  await updateWebhookEndpoint()

  await updateConfigs()

  await issuerIdentifier()

  console.log(issuerDID)

  if (issuerDID == null) {
    await setupIssuer()
  }

  printObject(context.getConfig(), '>>>', 'Context Used:')
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(context.getConfig()))
}

async function loadContext (contextFile) {
  return sdk.Context.createWithConfig(fs.readFileSync(CONFIG_PATH))
}

async function provisionAgent () {
  var verityUrl = await readlineInput('Verity Application Endpoint')
  verityUrl = verityUrl.trim()
  if (verityUrl === '') {
    verityUrl = 'http://localhost:9000'
  }

  console.log('Using Url: ' + verityUrl)

  // create initial Context
  var ctx = await sdk.Context.create('examplewallet1', 'examplewallet1', verityUrl, '')
  const provision = new sdk.protocols.Provision()
  // ask that an agent by provision (setup) and associated with created key pair
  return provision.provisionSdk(ctx)
}

async function updateWebhookEndpoint () {
  var webhookFromCtx = context.endpointUrl

  var webhook = await readlineInput(`Ngrok endpoint for port(${LISTENING_PORT})[${webhookFromCtx}]`)
  if (webhook === '') {
    webhook = webhookFromCtx
  }

  console.log('Using Webhook: ' + webhook)
  context.endpointUrl = webhook

  // request that verity application use specified webhook endpoint
  await new sdk.protocols.UpdateEndpoint().update(context)
}

async function updateConfigs () {
  const updateConfigs = new sdk.protocols.UpdateConfigs(INSTITUTION_NAME, LOGO_URL)
  await updateConfigs.update(context)
}

async function setupIssuer () {
  // constructor for the Issuer Setup protocol
  const issuerSetup = new sdk.protocols.IssuerSetup()
  var spinner = new Spinner('Waiting for setup to complete ... %s').setSpinnerDelay(450) // Console spinner

  // handler for created issuer identifier message
  var step = new Promise((resolve) => {
    handlers.addHandler(issuerSetup.msgFamily, issuerSetup.msgFamilyVersion, async (msgName, message) => {
      switch (msgName) {
        case issuerSetup.msgNames.PUBLIC_IDENTIFIER_CREATED:
          spinner.stop()
          printMessage(msgName, message)
          issuerDID = message.identifier.did
          issuerVerkey = message.identifier.verKey
          console.log('The issuer DID and Verkey must be on the ledger.')
          console.log(`Please add DID (${issuerDID}) and Verkey (${issuerVerkey}) to ledger.`)
          await readlineInput('Press ENTER when DID is on ledger')
          resolve(null)
          break
        default:
          printMessage(msgName, message)
          nonHandle('Message Name is not handled - ' + msgName)
      }
    })
  })

  spinner.start()
  // request that issuer identifier be created
  await issuerSetup.create(context)
  return step // wait for request to complete
}

async function issuerIdentifier () {
  // constructor for the Issuer Setup protocol
  const issuerSetup = new sdk.protocols.IssuerSetup()
  var spinner = new Spinner('Waiting for current issuer DID ... %s').setSpinnerDelay(450)

  // handler for current issuer identifier message
  var step = new Promise((resolve) => {
    handlers.addHandler(issuerSetup.msgFamily, issuerSetup.msgFamilyVersion, async (msgName, message) => {
      spinner.stop()
      switch (msgName) {
        case issuerSetup.msgNames.PUBLIC_IDENTIFIER:
          printMessage(msgName, message)
          issuerDID = message.did
          issuerVerkey = message.verKey
          break
      }
      resolve(null)
    })
  })

  spinner.start()
  // query the current identifier
  await issuerSetup.currentPublicIdentifier(context)
  return step // wait for response from verity application
}

//* ***********************
//         MAIN
//* ***********************
main()

async function main () {
  await start()
  await example()
  await end()
}

async function start () {
  const app = express()
  app.use(bodyParser.text({
    type: function (_) {
      return 'text'
    }
  }))

  app.post('/', async (req, res) => {
    await handlers.handleMessage(context, Buffer.from(req.body, 'utf8'))
    res.send('Success')
  })

  listener = http.createServer(app).listen(LISTENING_PORT)
  console.log(`Listening on port ${LISTENING_PORT}`)
}

async function end () {
  listener.close()
  rl.close()
  process.exit(0)
}

//* ***********************
//         UTILS
//* ***********************

// Simple utility functions for the Example app.

async function readlineInput (request) {
  console.log()

  return new Promise((resolve) => {
    rl.question(request + ': ', (response) => { resolve(response) })
  })
}

async function readlineYesNo (request, defaultYes) {
  var yesNo = defaultYes ? '[y]/n' : 'y/n'
  var modifiedRequest = request + '? ' + yesNo + ': '

  return new Promise((resolve) => {
    rl.question(modifiedRequest, (response) => {
      var normalized = response.trim().toLocaleLowerCase()
      if (defaultYes && normalized === '') {
        resolve(true)
      } else if (normalized === 'y') {
        resolve(true)
      } else if (normalized === 'n') {
        resolve(false)
      } else {
        console.error("Did not get a valid response -- '" + response + "' is not y or n")
        process.exit(-1)
      }
    })
  })
}

function printMessage (msgName, msg) {
  printObject(msg, '<<<', `Incomming Message -- ${msgName}`)
}

function printObject (obj, prefix, preamble) {
  console.log()
  console.log(prefix + '  ' + preamble)
  var lines = JSON.stringify(obj, null, 2).split('\n')
  lines.forEach(line => {
    console.log(prefix + '  ' + line)
  })
  console.log()
}

function nonHandle (msg) {
  console.error(msg)
  process.exit(-1)
}

function uuidv4 () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0; var v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}