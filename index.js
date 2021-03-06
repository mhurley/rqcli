#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const cli = require('commander')
const pkg = require('./package')
const cmd = require('./commands')
const config = require('./config')
const checkDirectorySync = require('./utils').checkDirectorySync

// Check that we're in the right folder unless we're using the setup command.
if (process.argv[2] != 'setup') {
  checkDirectorySync('api')
}

// Instantiate the CLI
cli.name('rqcli')
cli.version(pkg.version)
  .usage('<command> <args> [options]')

/**
* Accepts a token and saves it to the config file.
*/
cli.command('token <token>')
  .description('set the token')
  .action(token => {
    cmd.token(config, token)
    .then(newToken => {
      process.exit(0)
    })
  })

/**
* Logs the users certifications to the console.
* Options: --update, updates the certifications and logs them to the console.
*/
cli.command('certs')
  .option('-u, --update', 'update certificatons')
  .description('get project certifications')
  .action(options => {
    cmd.certs(config, options)
      .then(() => {
        process.exit(0)
      })
  })

/**
* Gets information on currently assigned submissions, and then prints out that
* information to the console.
*/
cli.command('assigned')
  .description('get the submissions that are assigned to you')
  .option('-n, --notify', 'Get desktop notifications of assigned reviews.')
  .action(options => {
    cmd.assigned(config, options)
    .then(submissions => {
      console.log(`You currently have ${submissions.length} submissions assigned.`)
      process.exit(0)
    })
  })

/**
* Gets any unread feedbacks from the last 30 days.
*/
cli.command('feedbacks')
  .description('save recent feedbacks from the API')
  .option('-n, --notify', 'Get desktop notifications of unread feedbacks.')
  .action(options => {
    cmd.feedbacks(config, options)
    .then(unread => {
      console.log(`You have ${unread.length} unread feedbacks.`)
      process.exit(0)
    })
  })

/**
* Starts requesting the Udacity Review API queue for assignments. Accepts
* a space separated list of project ids to request for.
*/
cli.command('assign <projectId> [moreIds...]')
  .description('poll the review queue for submissions')
  .option('-f, --feedbacks', 'periodically check for new feedbacks')
  .option('-n, --notify', 'Get desktop notifications.')
  .option('-a, --assigned-total', 'Show total number of reviews assigned this session.')
  .action((projectId, moreIds, options) => {
    cmd.assign(config, [projectId, ...moreIds], options)
  })

cli.command('review')
  .description('Start reviewing a project.')
  .action(() => {
    cmd.review(config)
  })

cli.command('money [months...]')
  .description('Start moneying a project.')
  .option('-f, --from <date>', 'check reviews from the selected <date>.')
  .option('-t, --to <date>', 'check reviews up to the selected <date>.')
  .action((months, options) => {
    cmd.money(config, months, options)
    .then(() => {
      process.exit(0)
    })
    .catch(() => {
      process.exit(0)
    })
  })

/**
* Sets up the config file with token and certifications. Also
* notifies the user of any submissions that are currently assigned as
* well as any unread feedbacks from the past 30 days.
*/
cli.command('setup <token>')
  .description('set up your review environment')
  .option('-n, --notify', 'Get desktop notifications of reviews status.')
  .action((token, options) => {
    // Sets up the folder for auth and logging.
    try {
      fs.mkdirSync(path.resolve('api'))
    } catch (e) {
      if (e.code !== 'EEXIST') {
        throw new Error(e)
      }
    }
    // Sets the certifications to always update when the init command is run.
    options.update = true
    cmd.token(config, token)
    .then(newToken => {
      console.log('Token has been saved.')
      config.auth.token = newToken
      return cmd.certs(config, options)
    })
    .then(() => {
      return cmd.assigned(config, options)
    })
    .then(submissions => {
      console.log(`You currently have ${submissions.length} submissions assigned.`)
      return cmd.feedbacks(config, options)
    })
    .then(unread => {
      console.log(`You have ${unread.length} unread feedbacks.`)
      process.exit(0)
    })
    .catch(err => {
      console.log(err)
      process.exit(0)
    })
  })

// Help if command doesn't exist:
cli.arguments('<command>')
  .action((command) => {
    console.log(`[ERROR] - Invalid command: ${command}\n`)
    cli.parse([process.argv[0], process.argv[1], '-h'])
    process.exit(0)
  })

cli.parse(process.argv)

// Help if no command was input:
if (!cli.args.length) {
  cli.parse([process.argv[0], process.argv[1], '-h'])
  process.exit(0)
}
