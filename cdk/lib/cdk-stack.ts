import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import kms = require('@aws-cdk/aws-kms');
import ec2 = require('@aws-cdk/aws-ec2');
import iam = require('@aws-cdk/aws-iam');
import codebuild = require('@aws-cdk/aws-codebuild');
import codecommit = require('@aws-cdk/aws-codecommit');
import targets = require('@aws-cdk/aws-events-targets');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import { AmazonLinuxImage, UserData, InstanceType, InstanceClass, InstanceSize, AmazonLinuxGeneration} from '@aws-cdk/aws-ec2';
import { Role, ServicePrincipal, ManagedPolicy, CfnInstanceProfile } from '@aws-cdk/aws-iam'
import { Fn, Tag, Resource } from '@aws-cdk/core';
import * as codedeploy from '@aws-cdk/aws-codedeploy';
import { Artifacts } from '@aws-cdk/aws-codebuild';
import { CodeBuildAction } from '@aws-cdk/aws-codepipeline-actions';
import { RemovalPolicy, Duration } from '@aws-cdk/core';
import sqs = require('@aws-cdk/aws-sqs');

export class CdkStackJavaApp extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    // The code that defines your stack goes here
    super(scope, id, props);

    

    // Code Commit Repo
    const repository = new codecommit.Repository(this, 'CodeCommitRepo', {
      repositoryName: `${cdk.Aws.STACK_NAME}-repo`
    });
    
    // VPC
    const vpc = new ec2.Vpc(this, 'CdkStackJavaApp-vpc', {
      maxAzs : 1
    });

    // Private Subnet
    const privateSubnet0 = vpc.privateSubnets[0];

    // S3 bucket
    const s3bucket = new s3.Bucket(this, 'CdkStackJavaApp-bucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Role for EC2 instance
    const role = new Role(this, 'Role', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com')
    });
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));


    // Code deploy application
    const application = new codedeploy.ServerApplication(this, 'CodeDeployApplication', {
      applicationName: 'CdkStackJavaAppApplication', // optional property
    });

    // Code deploy deployment group
    const deploymentGroup = new codedeploy.ServerDeploymentGroup(this, 'CodeDeployDeploymentGroup', {
      application,
      deploymentGroupName: `${cdk.Aws.STACK_NAME}-Group`,
      installAgent: true,
      ec2InstanceTags: new codedeploy.InstanceTagSet(
          {
              'Name': ['CdkStackJavaAppInstance']
          },
      ),
      ignorePollAlarmsFailure: false,
      autoRollback: {
          failedDeployment: false,
          stoppedDeployment: false
          },
      });

    // CODEBUILD - project
    const project = new codebuild.Project(this, 'CodeBuild', {
      projectName: `${this.stackName}`,
      source: codebuild.Source.codeCommit({ repository }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromAsset(this, 'CustomImage', {
          directory: './dockerAssets.d',
        }),
        privileged: true
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: {
            commands: [
              'env',
              'export TAG=${CODEBUILD_RESOLVED_SOURCE_VERSION}',
              'export CODEARTIFACT_AUTH_TOKEN=`aws codeartifact get-authorization-token --domain mydomain --domain-owner <YOUR_AWS_ACCOUNT_ID> --query authorizationToken --output text`',
              'env'       
             ]
          },
          build: {
            commands: [
              'aws --version',
              'ls -altr',
              `mvn package -Dmaven.test.skip=true -q`,
              'mvn compile -Dmaven.test.skip=true -q',
              'mvn -s settings.xml deploy'
            ]
          }
        },
        artifacts: {
          'base-directory': '.',
          files: [
            // 'target/*',
            'scripts/*',
            'appspec.yml',
            'src/**/*'
          ],
        }
      })
    })
    
    project.addToRolePolicy(new iam.PolicyStatement ({
      actions: ['codeartifact:*'],
      resources: ['*'],
    }));

    project.addToRolePolicy(new iam.PolicyStatement ({
      actions: ['sts:GetServiceBearerToken'],
      resources: ['*'],
    }));


    // PIPELINE

    const sourceOutput = new codepipeline.Artifact();

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'CodeCommit',
      branch: 'main',
      repository,
      output: sourceOutput,
    });

    const mavenBuildOutput = new codepipeline.Artifact();

    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: project,
      input: sourceOutput,
      outputs: [mavenBuildOutput], // optional
    });

    const deployAction = new codepipeline_actions.CodeDeployServerDeployAction({
      actionName: 'CodeDeploy',
      input: mavenBuildOutput,
      deploymentGroup
      });

    const pipeline = new codepipeline.Pipeline(this, 'CodePipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'Build',
          actions: [buildAction],
        },
        {
          stageName: 'Deploy',
          actions: [deployAction],
        }
      ],
    });
    // SSM Agent - locally

    const key = pipeline.artifactBucket.encryptionKey

    key?.addToResourcePolicy( new iam.PolicyStatement(
      {
        effect: iam.Effect.ALLOW,
        actions: ['kms:Decrypt','kms:DescribeKey'],
        resources: ['*'],
        principals: [role]
      }
    ), true)


    // User data for EC2 instance
    const userData = UserData.forLinux()

    // Ec2 instance 
    const instance = new ec2.Instance(this, 'Instance', {
      vpc: vpc,
      vpcSubnets: {
        subnets: vpc.publicSubnets
      },
      instanceType: InstanceType.of(InstanceClass.C5N, InstanceSize.LARGE),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      instanceName: "CdkStackJavaAppInstance",
      userData: userData,
      role: role,
      resourceSignalTimeout: Duration.minutes(10)
    }).instance;

    Tag.add(instance, 'Name', 'CdkStackJavaAppInstance');

    // User data commands for Ec2 instance
    userData.addCommands(
      'exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1',
      'yum install -y tmux jq java-11-amazon-corretto-headless ruby',
      'cd /home/ec2-user',
      'mkdir server',
      'chown -R ec2-user:ec2-user server',
      `wget https://d1osg35nybn3tt.cloudfront.net/com/amazonaws/codeguru-profiler-java-agent-standalone/1.1.1/codeguru-profiler-java-agent-standalone-1.1.1.jar`,
      'yum install -y aws-cli',
      'cd /tmp',
      `wget https://aws-codedeploy-${cdk.Aws.REGION}.s3.amazonaws.com/latest/codedeploy-agent.noarch.rpm -P /tmp`,
      'sudo yum -y install /tmp/codedeploy-agent.noarch.rpm',
      'sudo service codedeploy-agent status',
      `/opt/aws/bin/cfn-signal -e $? --stack ${cdk.Aws.STACK_NAME} --resource ${instance.logicalId} --region ${cdk.Aws.REGION}`
    );
    
    // SQS Queue
    const queue = new sqs.Queue(this, 'SQS_queue');
  }
}
