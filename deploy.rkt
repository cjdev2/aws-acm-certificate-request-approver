#!/usr/bin/env racket
#lang racket/base

(require racket/require
         json
         (multi-in racket [cmdline file format match port runtime-path string system]))

(let ([original-uncaught-exception-handler (uncaught-exception-handler)])
  (uncaught-exception-handler
   (λ (exn)
     (if (exn:break? exn)
         (exit 1)
         (original-uncaught-exception-handler exn)))))

(define-runtime-path script-path ".")
(current-directory script-path)

(define domain-name #f)
(define bucket #f)
(define stack-name #f)
(define skip-confirmation? #f)

(command-line
 #:once-each
 [("-d" "--domain")
  domain-name*
  "Domain name to automatically provision certificates for (example: d.cjpowered.com)"
  (set! domain-name domain-name*)]
 [("-b" "--s3-bucket")
  bucket*
  "S3 bucket to upload Lambda source code to"
  (set! bucket bucket*)]
 [("--stack-name")
  stack-name*
  "CloudFormation stack to create (if not provided, inferred from domain name)"
  (set! stack-name stack-name*)]
 [("--confirm")
  "Skip confirmation prompts"
  (set! skip-confirmation? #t)])

(unless domain-name
  (eprintf "error: the -d or --domain option is required (provide the --help flag for info)\n")
  (exit 1))

(unless bucket
  (eprintf "error: the -b or --s3-bucket option is required (provide the --help flag for info)\n")
  (exit 1))

(define normalized-name (string-replace (string-downcase domain-name) #px"[^a-z0-9]+" "-"))

(unless stack-name
  (set! stack-name (~a "cert-request-approver-" normalized-name)))

(display (~a "Deploying certificate validation approver for the following resources:\n"
             "\n"
             "        Route53 domain name: " domain-name "\n"
             "       CloudFormation stack: " stack-name "\n"
             "  S3 bucket for lambda code: " bucket "\n"))
(unless skip-confirmation?
  (display "\nPress enter to confirm (or provide the --confirm flag).")
  (void (read-line)))
(newline)

(define (exec! #:output-port [port #f] executable . args)
  (let ([out (open-output-string)])
    (unless (parameterize ([current-output-port (or port out)]
                           [current-error-port out])
              (apply system* (find-executable-path executable) args #:set-pwd? #t))
      (let ([str (get-output-string out)])
        (unless (regexp-match? #px"No changes to deploy\\." str)
          (eprintf "\nerror: command ‘~a’ failed with the following output:\n~a"
                   (string-join (cons executable (map ~a args)) " ") str)
          (exit 1)))))
  (void))

(display "Building source code with npm...") (flush-output)
(parameterize ([current-directory (build-path (current-directory) "lambda")])
  (exec! "npm" "install"))
(displayln " done.")

(define packaged-template (make-temporary-file "packaged-template-~a.yaml"))
(display "Uploading source code to S3...") (flush-output)
(exec! "aws" "cloudformation" "package"
       "--template" "cf-validation-approver.yaml"
       "--s3-bucket" bucket
       "--output-template-file" packaged-template)
(displayln " done.")

(display "Waiting for CloudFormation template to deploy...") (flush-output)
(exec! "aws" "cloudformation" "deploy"
       "--template-file" packaged-template
       "--stack-name" stack-name
       "--parameter-overrides" (~a "DomainName=" domain-name)
       "--capabilities" "CAPABILITY_IAM")
(displayln " done.")
