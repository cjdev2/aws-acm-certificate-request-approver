var AWS = require('aws-sdk')
var request = require('request-promise')
var Promise = require('bluebird')
var shortid = require('shortid')

var SES = new AWS.SES()
AWS.config.setPromisesDependency(Promise)

exports.handler = function (event, context) {
  function failed(message, physicalResourceId) {
    return request.put(event.ResponseURL, {
      body: JSON.stringify({
        Status: 'FAILED',
        Reason: message,
        PhysicalResourceId: physicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
      }),
    })
  }

  function success(physicalResourceId) {
    return request.put(event.ResponseURL, {
      body: JSON.stringify({
        Status: 'SUCCESS',
        PhysicalResourceId: physicalResourceId,
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
      }),
    })
  }

  Promise.try(function() {
    var stackName = event.StackId.match(/arn:aws:cloudformation:[^:]+:[^:]+:stack\/(.+)\/[-a-z0-9]/)[1]
    var physicalName = event.PhysicalResourceId
    var createOrUpdate = SES.updateReceiptRule.bind(SES)
    switch (event.ResourceType) {
      case 'Custom::ReceiptRule':
        switch (event.RequestType) {
          case 'Create':
            physicalName = (stackName + '-' + event.LogicalResourceId).substring(0, 49) + '-' + shortid.generate()
            createOrUpdate = SES.createReceiptRule.bind(SES)
          case 'Update':
            var payload = event.ResourceProperties
            payload.Rule.Name = physicalName
            payload.Rule.Enabled = true
            delete payload.ServiceToken
            return createOrUpdate(payload).promise().then(function () { return success(physicalName) })
          case 'Delete':
            return SES.describeReceiptRuleSet({ RuleSetName: event.ResourceProperties.RuleSetName }).promise().then(function (data) {
              // only try to delete the rule if it exists (and it might not exist if it failed to create)
              if (data.Rules.map(function (rule) { return rule.name }).indexOf(physicalName) === -1) {
                return success(physicalName)
              } else {
                return SES.deleteReceiptRule({
                  RuleName: physicalName,
                  RuleSetName: event.ResourceProperties.RuleSetName
                }).promise().then(function () { return success(physicalName) })
              }
            })
          default:
            return failed('unknown request type ' + event.RequestType, physicalName || 'N/A')
        }
      default:
        return failed('unknown resource type ' + event.ResourceType, physicalName || 'N/A')
    }
  }).catch(function (err) {
      console.error(err)
      return failed(err.toString(), event.PhysicalResourceId || 'N/A').catch(function (err) { console.error(err) })
    }).finally(function () {
      context.done()
    })
}
