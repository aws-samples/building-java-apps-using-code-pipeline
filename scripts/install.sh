# Download the latest artifact from code artifact
set -ex
rm -rf /home/ec2-user/server/demoapplication.jar
aws codeartifact get-package-version-asset --region=<region> --domain mydomain --repository mycdkdemoapp --format maven --package DemoApplication --namespace org.example --package-version 1.6 --asset DemoApplication-1.6-jar-with-dependencies.jar /home/ec2-user/server/demoapplication.jar > /tmp/demooutput 2>&1
