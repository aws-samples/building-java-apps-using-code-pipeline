#!/bin/bash
set -ex         
export DEMO_APP_BUCKET_NAME=<bucket_name>
export AWS_CODEGURU_TARGET_REGION=<region>
export DEMO_APP_SQS_URL=<https_sqs_url>
export AWS_CODEGURU_PROFILER_GROUP_NAME=myDemoApp0911-WithIssues
ls
pwd
cd /home/ec2-user/server/
nohup java -javaagent:/home/ec2-user/codeguru-profiler-java-agent-standalone-1.0.0.jar -jar /home/ec2-user/server/demoapplication.jar with-issues > /tmp/app.log 2>&1 &
echo "do nothing"