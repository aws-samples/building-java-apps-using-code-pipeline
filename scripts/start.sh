#!/bin/bash
set -ex         
export DEMO_APP_BUCKET_NAME=<bucket_name>
export AWS_CODEGURU_TARGET_REGION=<region>
export DEMO_APP_SQS_URL=<https_sqs_url>
export AWS_CODEGURU_PROFILER_GROUP_NAME=myCodeGuruProfilingGroup-WithIssues
export AWS_CODEGURU_PROFILER_HEAP_SUMMARY_ENABLED=true
ls
pwd
cd /home/ec2-user/server/
java -javaagent:/home/ec2-user/codeguru-profiler-java-agent-standalone-1.1.1.jar="profilingGroupName:myCodeGuruProfilingGroup-WithIssues,heapSummaryEnabled:true" -jar /home/ec2-user/server/demoapplication.jar with-issues &>/dev/null &
echo "do nothing"
