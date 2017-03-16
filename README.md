# AWS ACM Certificate Request Approver

AWS provides ACM, the *AWS Certificate Manager*, which can automatically provision HTTPS certificates for domains you own. However, unfortunately, it does not provide any integration with Route53, so even if your domain is already managed by AWS, ACM will still send an email address to the domain owner each time a certificate is requested. The domain owner needs to manually approve each request before the certificate is provisioned.

This is not terribly burdensome for many deployment needs, but software-defined deployments using AWS CloudFormation or a similar tool may automatically request a certificate, and the approval step can turn a fully automated deployment process into one that requires a manual step. This project provides a self-contained, easily-deployable service that will intercept certificate requests and automatically approve them, mitigating the need for a human to press a button.

## Deploying

To use this project, you will need:

  - A Route53 hosted zone to automatically provision certificates for
  - The AWS CLI
  - An S3 bucket to hold the source code of the Lambda function that processes requests
  - An installation of Racket

With all this in place, you can run `./deploy.rkt` to automatically build the project, upload the source code to S3, and provision the necessary infrastructure in AWS using CloudFormation.

The script will inform you the name of the stack it creates. If you want to teardown the request approver, simply run `aws cloudformation delete-stack` and provide the stack name produced by the deploy script. This will automatically remove *all* the infrastructure created by the deployment (though the S3 bucket that holds the source code of the Lambda function will not be removed).
