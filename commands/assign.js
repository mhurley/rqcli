#!/usr/bin/env node

const path = require('path')
const readline = require('readline')
const notifier = require('node-notifier')
const moment = require('moment')
const chalk = require('chalk')
const apiCall = require('../utils').apiCall
const feedbacks = require('./feedbacks')

module.exports = (config, projectQueue, options) => {
  // Using sets to validate input ids.
  const certIds = new Set(config.certs.certified.map(x => x.id))
  const invalidIds = new Set(projectQueue.filter(id => !certIds.has(id)))
  if (invalidIds.size) {
    throw new Error(
      `Illegal Action: Not certified for project(s) ${[...invalidIds].join(', ')}`)
  }

  const {auth: {token, tokenAge}} = config
  const startTime = moment()
  const assignedInterval = 60
  const feedbacksInterval = 300

  let assigned = 0
  let unreadFeedbacks = new Set()
  let callsTotal = 0
  let errorMsg = ''
  let tick = 0

  const checkInterval = interval => tick % interval === 0
  const countdown = interval => interval - tick % interval
  const tokenExpiryWarning = () => tokenAge - moment().dayOfYear() < 5

  /**
  * Checks how many submissions are currently assigned to the user at a
  * constant interval. If it's 2, it waits the length of the interval and
  * checks again. As long as it's less than 2 it requests a new assignment
  * once every second.
  */
  function requestNewAssignment () {
    // Check for new feedbacks every hour
    if (options.feedbacks && checkInterval(feedbacksInterval)) {
      feedbacks(config)
      .then(unread => {
        unread.forEach(fb => {
          if (options.notify && !unreadFeedbacks.has(fb.submission_id)) {
            config.feedbacks.notify(fb)
          }
        })
        unreadFeedbacks = new Set(unread.filter(fb => fb.submission_id))
      })
    }
    // Check how many submissions have been assigned at a given interval.
    if (checkInterval(assignedInterval)) {
      apiCall(token, 'assigned')
      .then(res => {
        assigned = res.body.length
      })
    }
    // If the max number of submissions is assigned we wait the interval.
    // Otherwise we request an assignment from the API.
    if (assigned === 2) {
      setPrompt(`Max submissions assigned. Checking again in ${countdown(assignedInterval)} seconds.`)
    } else {
      let projectId = projectQueue[callsTotal % projectQueue.length]
      setPrompt(`Requesting assignment for project ${projectId}`)
      errorMsg = ''
      callsTotal++
      apiCall(token, 'assign', projectId)
      .then(res => {
        if (res.statusCode === 201) {
          assigned++
          let name = res.body.project.name
          let id = res.body.id
          notifier.notify({
            title: 'New Review Assigned!',
            message: `${name}, ID: ${id}`,
            open: `https://review.udacity.com/#!/submissions/${id}`,
            icon: path.join(__dirname, 'clipboard.svg'),
            sound: 'Ping'
          })
        } else if (res.statusCode !== 404) {
          errorMsg = res.statusCode
        }
      })
    }
    setTimeout(() => {
      tick++
      requestNewAssignment()
    }, 1000)
  }
  requestNewAssignment()

  /**
  * Writes the current information to the terminal.
  */
  function setPrompt (taskMsg) {
    // Clearing the screen
    readline.cursorTo(process.stdout, 0, 0)
    readline.clearScreenDown(process.stdout)

    // Warnings
    if (tokenExpiryWarning()) {
      console.log(chalk.red(`Token expires ${moment().dayOfYear(tokenAge).fromNow()}`))
    }

    // Genral info
    let uptime = startTime.fromNow(true)
    console.log(chalk.green(`Uptime: ${chalk.white(uptime)}`))
    console.log(chalk.green(`Current task: ${chalk.white(taskMsg)}`))
    console.log(chalk.green(`Total requests for assignments: ${chalk.white(callsTotal)}`))

    // Assigned
    let assignedMsg = 'checking...'
    if (!checkInterval(assignedInterval)) {
      assignedMsg = `updating in ${countdown(assignedInterval)} seconds`
    }
    console.log(chalk.blue(
      `-> Currently assigned: ${chalk.white(assigned)} - ${chalk.yellow(assignedMsg)}`))

    // Feedbacks
    if (options.feedbacks) {
      let fbMsg = 'checking...'
      if (!checkInterval(feedbacksInterval)) {
        let duration = moment.duration(countdown(feedbacksInterval), 'seconds')
        fbMsg = `updating ${duration.humanize(true)}`
      }
      console.log(chalk.blue(`-> Unread feedbacks: ${chalk.white(unreadFeedbacks.size)} - ${chalk.yellow(fbMsg)}`))
    }
    // Errors
    if (errorMsg) {
      console.log(chalk.red(`Server responded with ${errorMsg}`))
    }
    console.log(chalk.green(`Press ${chalk.white('ctrl+c')} to exit`))
  }
}

