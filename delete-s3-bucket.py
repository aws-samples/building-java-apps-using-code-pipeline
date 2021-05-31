#!/usr/bin/env python

#USE WITH CARE
#This script deletes all versions of objects from the s3 bucket to expedite deleting

BUCKET = '<s3-bucket>' 

import boto3
import time
s3 = boto3.resource('s3')
bucket = s3.Bucket(BUCKET)
bucket.object_versions.delete()
print("S3 bucket all object versions delete API invoked")
time.sleep(3)

# delete the now-empty bucket as well, uncomment this line:
bucket.delete()
print("S3 bucket delete complete")
