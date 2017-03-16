var AWS = require('aws-sdk')
var S3 = new AWS.S3({ signatureVersion: 'v4' })
var request = require('request');

exports.handler = function (event, context, callback) {
  var logCallback = function (err, message) {
    if (err) { console.error(err) }
    if (message) { console.log(message) }
    callback(err, message)
  }

  var payload = event.Records[0].ses
  S3.getObject({ Bucket: process.env.S3_BUCKET, Key: payload.mail.messageId }, function (err, result) {
    if (err) { return logCallback(err) }

    var body = result.Body.toString()
    var values = body.match(/certificates\.amazon\.com\/approvals\?code=([-0-9a-f]+)&context=([-0-9a-f]+)/)
    if (!values) { return logCallback('message did not include certificate approval link') }

    request.post('https://certificates.amazon.com/approvals', { form: {
      validation_token: values[1],
      context: values[2],
    }}, function (err, response, body) {
      if (err) { return logCallback(err) }
      logCallback(null, 'success')
    })
  })
}
