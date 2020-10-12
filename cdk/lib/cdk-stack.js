"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = require("@aws-cdk/core");
const s3 = require("@aws-cdk/aws-s3");
const ec2 = require("@aws-cdk/aws-ec2");
const iam = require("@aws-cdk/aws-iam");
const codebuild = require("@aws-cdk/aws-codebuild");
const codecommit = require("@aws-cdk/aws-codecommit");
const codepipeline = require("@aws-cdk/aws-codepipeline");
const codepipeline_actions = require("@aws-cdk/aws-codepipeline-actions");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_iam_1 = require("@aws-cdk/aws-iam");
const core_1 = require("@aws-cdk/core");
const codedeploy = require("@aws-cdk/aws-codedeploy");
const core_2 = require("@aws-cdk/core");
const sqs = require("@aws-cdk/aws-sqs");
class CdkStackJavaApp extends cdk.Stack {
    constructor(scope, id, props) {
        var _a;
        // The code that defines your stack goes here
        super(scope, id, props);
        // Code Commit Repo
        const repository = new codecommit.Repository(this, 'CodeCommitRepo', {
            repositoryName: `${cdk.Aws.STACK_NAME}-repo`
        });
        // VPC
        const vpc = new ec2.Vpc(this, 'CdkStackJavaApp-vpc', {
            maxAzs: 1
        });
        // Private Subnet
        const privateSubnet0 = vpc.privateSubnets[0];
        // S3 bucket
        const s3bucket = new s3.Bucket(this, 'CdkStackJavaApp-bucket', {
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        // Role for EC2 instance
        const role = new aws_iam_1.Role(this, 'Role', {
            assumedBy: new aws_iam_1.ServicePrincipal('ec2.amazonaws.com')
        });
        role.addManagedPolicy(aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        role.addManagedPolicy(aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
        // Code deploy application
        const application = new codedeploy.ServerApplication(this, 'CodeDeployApplication', {
            applicationName: 'CdkStackJavaAppApplication',
        });
        // Code deploy deployment group
        const deploymentGroup = new codedeploy.ServerDeploymentGroup(this, 'CodeDeployDeploymentGroup', {
            application,
            deploymentGroupName: `${cdk.Aws.STACK_NAME}-Group`,
            installAgent: true,
            ec2InstanceTags: new codedeploy.InstanceTagSet({
                'Name': ['CdkStackJavaAppInstance']
            }),
            ignorePollAlarmsFailure: false,
            autoRollback: {
                failedDeployment: true,
                stoppedDeployment: true
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
                            'export CODEARTIFACT_AUTH_TOKEN=`aws codeartifact get-authorization-token --domain mycdkdemoapp --domain-owner 481090335964 --query authorizationToken --output text`',
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
                            // TODO1: log into code artifact &
                            // TODO2: Publish the package into code artifact
                        ]
                    }
                },
                artifacts: {
                    'base-directory': '.',
                    files: [
                        // 'target/*',
                        'scripts/*',
                        'appspec.yml',
                        'src/*'
                    ],
                }
            }),
            artifacts: codebuild.Artifacts.s3({
                bucket: s3bucket,
                includeBuildId: false,
                packageZip: true,
                path: 'target/*',
                identifier: 'AddArtifactJarFiles',
            }),
        });
        project.addToRolePolicy(new iam.PolicyStatement({
            actions: ['codeartifact:*'],
            resources: ['*'],
        }));
        project.addToRolePolicy(new iam.PolicyStatement({
            actions: ['sts:GetServiceBearerToken'],
            resources: ['*'],
        }));
        // PIPELINE
        const sourceOutput = new codepipeline.Artifact();
        const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
            actionName: 'CodeCommit',
            repository,
            output: sourceOutput,
        });
        const mavenBuildOutput = new codepipeline.Artifact();
        const buildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'CodeBuild',
            project: project,
            input: sourceOutput,
            outputs: [mavenBuildOutput],
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
        const key = pipeline.artifactBucket.encryptionKey;
        (_a = key) === null || _a === void 0 ? void 0 : _a.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['kms:Decrypt', 'kms:DescribeKey'],
            resources: ['*'],
            principals: [role]
        }), true);
        // User data for EC2 instance
        const userData = aws_ec2_1.UserData.forLinux();
        // Ec2 instance 
        const instance = new ec2.Instance(this, 'Instance', {
            vpc: vpc,
            vpcSubnets: {
                subnets: vpc.publicSubnets
            },
            instanceType: aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.C5N, aws_ec2_1.InstanceSize.LARGE),
            machineImage: new aws_ec2_1.AmazonLinuxImage({
                generation: aws_ec2_1.AmazonLinuxGeneration.AMAZON_LINUX_2
            }),
            instanceName: "CdkStackJavaAppInstance",
            userData: userData,
            role: role,
            resourceSignalTimeout: core_2.Duration.minutes(10)
        }).instance;
        core_1.Tag.add(instance, 'Name', 'CdkStackJavaAppInstance');
        // User data commands for Ec2 instance
        userData.addCommands('exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1', 'yum install -y tmux jq java-11-amazon-corretto-headless ruby', 'cd /home/ec2-user', `wget https://d1osg35nybn3tt.cloudfront.net/com/amazonaws/codeguru-profiler-java-agent-standalone/1.0.0/codeguru-profiler-java-agent-standalone-1.0.0.jar`, 'yum install -y aws-cli', 'cd /tmp', `wget https://aws-codedeploy-${cdk.Aws.REGION}.s3.amazonaws.com/latest/codedeploy-agent.noarch.rpm -P /tmp`, 'sudo yum -y install /tmp/codedeploy-agent.noarch.rpm', 'sudo service codedeploy-agent status', `/opt/aws/bin/cfn-signal -e $? --stack ${cdk.Aws.STACK_NAME} --resource ${instance.logicalId} --region ${cdk.Aws.REGION}`);
        // SQS Queue
        const queue = new sqs.Queue(this, 'SQS_queue');
    }
}
exports.CdkStackJavaApp = CdkStackJavaApp;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEscUNBQXFDO0FBQ3JDLHNDQUFzQztBQUV0Qyx3Q0FBeUM7QUFDekMsd0NBQXlDO0FBQ3pDLG9EQUFxRDtBQUNyRCxzREFBdUQ7QUFFdkQsMERBQTJEO0FBQzNELDBFQUEyRTtBQUMzRSw4Q0FBK0g7QUFDL0gsOENBQTRGO0FBQzVGLHdDQUFrRDtBQUNsRCxzREFBc0Q7QUFHdEQsd0NBQXdEO0FBQ3hELHdDQUF5QztBQUV6QyxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxLQUFzQjs7UUFDbEUsNkNBQTZDO1FBQzdDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBSXhCLG1CQUFtQjtRQUNuQixNQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ25FLGNBQWMsRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxPQUFPO1NBQzdDLENBQUMsQ0FBQztRQUVILE1BQU07UUFDTixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ25ELE1BQU0sRUFBRyxDQUFDO1NBQ1gsQ0FBQyxDQUFDO1FBRUgsaUJBQWlCO1FBQ2pCLE1BQU0sY0FBYyxHQUFHLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0MsWUFBWTtRQUNaLE1BQU0sUUFBUSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDN0QsU0FBUyxFQUFFLElBQUk7WUFDZixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENB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LENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUVyRCxzQ0FBc0M7UUFDdEMsUUFBUSxDQUFDLFdBQVcsQ0FDbEIsaUZBQWlGLEVBQ2pGLDhEQUE4RCxFQUM5RCxtQkFBbUIsRUFDbkIsMEpBQTBKLEVBQzFKLHdCQUF3QixFQUN4QixTQUFTLEVBQ1QsK0JBQStCLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSw4REFBOEQsRUFDM0csc0RBQXNELEVBQ3RELHNDQUFzQyxFQUN0Qyx5Q0FBeUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxVQUFVLGVBQWUsUUFBUSxDQUFDLFNBQVMsYUFBYSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUMxSCxDQUFDO1FBRUYsWUFBWTtRQUNaLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDakQsQ0FBQztDQUNGO0FBcE5ELDBDQW9OQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ0Bhd3MtY2RrL2F3cy1zMyc7XG5pbXBvcnQga21zID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWttcycpO1xuaW1wb3J0IGVjMiA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1lYzInKTtcbmltcG9ydCBpYW0gPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtaWFtJyk7XG5pbXBvcnQgY29kZWJ1aWxkID0gcmVxdWlyZSgnQGF3cy1jZGsvYXdzLWNvZGVidWlsZCcpO1xuaW1wb3J0IGNvZGVjb21taXQgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtY29kZWNvbW1pdCcpO1xuaW1wb3J0IHRhcmdldHMgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtZXZlbnRzLXRhcmdldHMnKTtcbmltcG9ydCBjb2RlcGlwZWxpbmUgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtY29kZXBpcGVsaW5lJyk7XG5pbXBvcnQgY29kZXBpcGVsaW5lX2FjdGlvbnMgPSByZXF1aXJlKCdAYXdzLWNkay9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnKTtcbmltcG9ydCB7IEFtYXpvbkxpbnV4SW1hZ2UsIFVzZXJEYXRhLCBJbnN0YW5jZVR5cGUsIEluc3RhbmNlQ2xhc3MsIEluc3RhbmNlU2l6ZSwgQW1hem9uTGludXhHZW5lcmF0aW9ufSBmcm9tICdAYXdzLWNkay9hd3MtZWMyJztcbmltcG9ydCB7IFJvbGUsIFNlcnZpY2VQcmluY2lwYWwsIE1hbmFnZWRQb2xpY3ksIENmbkluc3RhbmNlUHJvZmlsZSB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1pYW0nXG5pbXBvcnQgeyBGbiwgVGFnLCBSZXNvdXJjZSB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0ICogYXMgY29kZWRlcGxveSBmcm9tICdAYXdzLWNkay9hd3MtY29kZWRlcGxveSc7XG5pbXBvcnQgeyBBcnRpZmFjdHMgfSBmcm9tICdAYXdzLWNkay9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCB7IENvZGVCdWlsZEFjdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1jb2RlcGlwZWxpbmUtYWN0aW9ucyc7XG5pbXBvcnQgeyBSZW1vdmFsUG9saWN5LCBEdXJhdGlvbiB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0IHNxcyA9IHJlcXVpcmUoJ0Bhd3MtY2RrL2F3cy1zcXMnKTtcblxuZXhwb3J0IGNsYXNzIENka1N0YWNrSmF2YUFwcCBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgLy8gVGhlIGNvZGUgdGhhdCBkZWZpbmVzIHlvdXIgc3RhY2sgZ29lcyBoZXJlXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBcblxuICAgIC8vIENvZGUgQ29tbWl0IFJlcG9cbiAgICBjb25zdCByZXBvc2l0b3J5ID0gbmV3IGNvZGVjb21taXQuUmVwb3NpdG9yeSh0aGlzLCAnQ29kZUNvbW1pdFJlcG8nLCB7XG4gICAgICByZXBvc2l0b3J5TmFtZTogYCR7Y2RrLkF3cy5TVEFDS19OQU1FfS1yZXBvYFxuICAgIH0pO1xuICAgIFxuICAgIC8vIFZQQ1xuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdDZGtTdGFja0phdmFBcHAtdnBjJywge1xuICAgICAgbWF4QXpzIDogMVxuICAgIH0pO1xuXG4gICAgLy8gUHJpdmF0ZSBTdWJuZXRcbiAgICBjb25zdCBwcml2YXRlU3VibmV0MCA9IHZwYy5wcml2YXRlU3VibmV0c1swXTtcblxuICAgIC8vIFMzIGJ1Y2tldFxuICAgIGNvbnN0IHMzYnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQ2RrU3RhY2tKYXZhQXBwLWJ1Y2tldCcsIHtcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIFJvbGUgZm9yIEVDMiBpbnN0YW5jZVxuICAgIGNvbnN0IHJvbGUgPSBuZXcgUm9sZSh0aGlzLCAnUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IFNlcnZpY2VQcmluY2lwYWwoJ2VjMi5hbWF6b25hd3MuY29tJylcbiAgICB9KTtcbiAgICByb2xlLmFkZE1hbmFnZWRQb2xpY3koTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ0FtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmUnKSk7XG4gICAgcm9sZS5hZGRNYW5hZ2VkUG9saWN5KE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzJykpO1xuXG5cbiAgICAvLyBDb2RlIGRlcGxveSBhcHBsaWNhdGlvblxuICAgIGNvbnN0IGFwcGxpY2F0aW9uID0gbmV3IGNvZGVkZXBsb3kuU2VydmVyQXBwbGljYXRpb24odGhpcywgJ0NvZGVEZXBsb3lBcHBsaWNhdGlvbicsIHtcbiAgICAgIGFwcGxpY2F0aW9uTmFtZTogJ0Nka1N0YWNrSmF2YUFwcEFwcGxpY2F0aW9uJywgLy8gb3B0aW9uYWwgcHJvcGVydHlcbiAgICB9KTtcblxuICAgIC8vIENvZGUgZGVwbG95IGRlcGxveW1lbnQgZ3JvdXBcbiAgICBjb25zdCBkZXBsb3ltZW50R3JvdXAgPSBuZXcgY29kZWRlcGxveS5TZXJ2ZXJEZXBsb3ltZW50R3JvdXAodGhpcywgJ0NvZGVEZXBsb3lEZXBsb3ltZW50R3JvdXAnLCB7XG4gICAgICBhcHBsaWNhdGlvbixcbiAgICAgIGRlcGxveW1lbnRHcm91cE5hbWU6IGAke2Nkay5Bd3MuU1RBQ0tfTkFNRX0tR3JvdXBgLFxuICAgICAgaW5zdGFsbEFnZW50OiB0cnVlLFxuICAgICAgZWMySW5zdGFuY2VUYWdzOiBuZXcgY29kZWRlcGxveS5JbnN0YW5jZVRhZ1NldChcbiAgICAgICAgICB7XG4gICAgICAgICAgICAgICdOYW1lJzogWydDZGtTdGFja0phdmFBcHBJbnN0YW5jZSddXG4gICAgICAgICAgfSxcbiAgICAgICksXG4gICAgICBpZ25vcmVQb2xsQWxhcm1zRmFpbHVyZTogZmFsc2UsXG4gICAgICBhdXRvUm9sbGJhY2s6IHtcbiAgICAgICAgICBmYWlsZWREZXBsb3ltZW50OiB0cnVlLFxuICAgICAgICAgIHN0b3BwZWREZXBsb3ltZW50OiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgLy8gQ09ERUJVSUxEIC0gcHJvamVjdFxuICAgIGNvbnN0IHByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlByb2plY3QodGhpcywgJ0NvZGVCdWlsZCcsIHtcbiAgICAgIHByb2plY3ROYW1lOiBgJHt0aGlzLnN0YWNrTmFtZX1gLFxuICAgICAgc291cmNlOiBjb2RlYnVpbGQuU291cmNlLmNvZGVDb21taXQoeyByZXBvc2l0b3J5IH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5mcm9tQXNzZXQodGhpcywgJ0N1c3RvbUltYWdlJywge1xuICAgICAgICAgIGRpcmVjdG9yeTogJy4vZG9ja2VyQXNzZXRzLmQnLFxuICAgICAgICB9KSxcbiAgICAgICAgcHJpdmlsZWdlZDogdHJ1ZVxuICAgICAgfSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcbiAgICAgICAgdmVyc2lvbjogXCIwLjJcIixcbiAgICAgICAgcGhhc2VzOiB7XG4gICAgICAgICAgcHJlX2J1aWxkOiB7XG4gICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAnZW52JyxcbiAgICAgICAgICAgICAgJ2V4cG9ydCBUQUc9JHtDT0RFQlVJTERfUkVTT0xWRURfU09VUkNFX1ZFUlNJT059JyxcbiAgICAgICAgICAgICAgJ2V4cG9ydCBDT0RFQVJUSUZBQ1RfQVVUSF9UT0tFTj1gYXdzIGNvZGVhcnRpZmFjdCBnZXQtYXV0aG9yaXphdGlvbi10b2tlbiAtLWRvbWFpbiBteWNka2RlbW9hcHAgLS1kb21haW4tb3duZXIgNDgxMDkwMzM1OTY0IC0tcXVlcnkgYXV0aG9yaXphdGlvblRva2VuIC0tb3V0cHV0IHRleHRgJyxcbiAgICAgICAgICAgICAgJ2VudicgICAgICAgXG4gICAgICAgICAgICAgXVxuICAgICAgICAgIH0sXG4gICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdhd3MgLS12ZXJzaW9uJyxcbiAgICAgICAgICAgICAgJ2xzIC1hbHRyJyxcbiAgICAgICAgICAgICAgYG12biBwYWNrYWdlIC1EbWF2ZW4udGVzdC5za2lwPXRydWUgLXFgLFxuICAgICAgICAgICAgICAnbXZuIGNvbXBpbGUgLURtYXZlbi50ZXN0LnNraXA9dHJ1ZSAtcScsXG4gICAgICAgICAgICAgICdtdm4gLXMgc2V0dGluZ3MueG1sIGRlcGxveSdcbiAgICAgICAgICAgICAgLy8gVE9ETzE6IGxvZyBpbnRvIGNvZGUgYXJ0aWZhY3QgJlxuICAgICAgICAgICAgICAvLyBUT0RPMjogUHVibGlzaCB0aGUgcGFja2FnZSBpbnRvIGNvZGUgYXJ0aWZhY3RcbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGFydGlmYWN0czoge1xuICAgICAgICAgICdiYXNlLWRpcmVjdG9yeSc6ICcuJyxcbiAgICAgICAgICBmaWxlczogW1xuICAgICAgICAgICAgLy8gJ3RhcmdldC8qJyxcbiAgICAgICAgICAgICdzY3JpcHRzLyonLFxuICAgICAgICAgICAgJ2FwcHNwZWMueW1sJyxcbiAgICAgICAgICAgICdzcmMvKidcbiAgICAgICAgICBdLFxuICAgICAgICB9XG4gICAgICB9KSxcbiAgICAgIGFydGlmYWN0czogY29kZWJ1aWxkLkFydGlmYWN0cy5zMyh7XG4gICAgICAgIGJ1Y2tldDpzM2J1Y2tldCxcbiAgICAgICAgaW5jbHVkZUJ1aWxkSWQ6IGZhbHNlLFxuICAgICAgICBwYWNrYWdlWmlwOiB0cnVlLFxuICAgICAgICBwYXRoOiAndGFyZ2V0LyonLFxuICAgICAgICBpZGVudGlmaWVyOiAnQWRkQXJ0aWZhY3RKYXJGaWxlcycsXG4gICAgICB9KSxcbiAgICB9KVxuICAgIFxuICAgIHByb2plY3QuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50ICh7XG4gICAgICBhY3Rpb25zOiBbJ2NvZGVhcnRpZmFjdDoqJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgIH0pKTtcblxuICAgIHByb2plY3QuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50ICh7XG4gICAgICBhY3Rpb25zOiBbJ3N0czpHZXRTZXJ2aWNlQmVhcmVyVG9rZW4nXSxcbiAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgfSkpO1xuXG5cbiAgICAvLyBQSVBFTElORVxuXG4gICAgY29uc3Qgc291cmNlT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgpO1xuXG4gICAgY29uc3Qgc291cmNlQWN0aW9uID0gbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkNvZGVDb21taXRTb3VyY2VBY3Rpb24oe1xuICAgICAgYWN0aW9uTmFtZTogJ0NvZGVDb21taXQnLFxuICAgICAgcmVwb3NpdG9yeSxcbiAgICAgIG91dHB1dDogc291cmNlT3V0cHV0LFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWF2ZW5CdWlsZE91dHB1dCA9IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoKTtcblxuICAgIGNvbnN0IGJ1aWxkQWN0aW9uID0gbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICBhY3Rpb25OYW1lOiAnQ29kZUJ1aWxkJyxcbiAgICAgIHByb2plY3Q6IHByb2plY3QsXG4gICAgICBpbnB1dDogc291cmNlT3V0cHV0LFxuICAgICAgb3V0cHV0czogW21hdmVuQnVpbGRPdXRwdXRdLCAvLyBvcHRpb25hbFxuICAgIH0pO1xuXG4gICAgY29uc3QgZGVwbG95QWN0aW9uID0gbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkNvZGVEZXBsb3lTZXJ2ZXJEZXBsb3lBY3Rpb24oe1xuICAgICAgYWN0aW9uTmFtZTogJ0NvZGVEZXBsb3knLFxuICAgICAgaW5wdXQ6IG1hdmVuQnVpbGRPdXRwdXQsXG4gICAgICBkZXBsb3ltZW50R3JvdXBcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdDb2RlUGlwZWxpbmUnLCB7XG4gICAgICBzdGFnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHN0YWdlTmFtZTogJ1NvdXJjZScsXG4gICAgICAgICAgYWN0aW9uczogW3NvdXJjZUFjdGlvbl0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgYWN0aW9uczogW2J1aWxkQWN0aW9uXSxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHN0YWdlTmFtZTogJ0RlcGxveScsXG4gICAgICAgICAgYWN0aW9uczogW2RlcGxveUFjdGlvbl0sXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgfSk7XG4gICAgLy8gU1NNIEFnZW50IC0gbG9jYWxseVxuXG4gICAgY29uc3Qga2V5ID0gcGlwZWxpbmUuYXJ0aWZhY3RCdWNrZXQuZW5jcnlwdGlvbktleVxuXG4gICAga2V5Py5hZGRUb1Jlc291cmNlUG9saWN5KCBuZXcgaWFtLlBvbGljeVN0YXRlbWVudChcbiAgICAgIHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2ttczpEZWNyeXB0Jywna21zOkRlc2NyaWJlS2V5J10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICAgIHByaW5jaXBhbHM6IFtyb2xlXVxuICAgICAgfVxuICAgICksIHRydWUpXG5cblxuICAgIC8vIFVzZXIgZGF0YSBmb3IgRUMyIGluc3RhbmNlXG4gICAgY29uc3QgdXNlckRhdGEgPSBVc2VyRGF0YS5mb3JMaW51eCgpXG5cbiAgICAvLyBFYzIgaW5zdGFuY2UgXG4gICAgY29uc3QgaW5zdGFuY2UgPSBuZXcgZWMyLkluc3RhbmNlKHRoaXMsICdJbnN0YW5jZScsIHtcbiAgICAgIHZwYzogdnBjLFxuICAgICAgdnBjU3VibmV0czoge1xuICAgICAgICBzdWJuZXRzOiB2cGMucHVibGljU3VibmV0c1xuICAgICAgfSxcbiAgICAgIGluc3RhbmNlVHlwZTogSW5zdGFuY2VUeXBlLm9mKEluc3RhbmNlQ2xhc3MuQzVOLCBJbnN0YW5jZVNpemUuTEFSR0UpLFxuICAgICAgbWFjaGluZUltYWdlOiBuZXcgQW1hem9uTGludXhJbWFnZSh7XG4gICAgICAgIGdlbmVyYXRpb246IEFtYXpvbkxpbnV4R2VuZXJhdGlvbi5BTUFaT05fTElOVVhfMlxuICAgICAgfSksXG4gICAgICBpbnN0YW5jZU5hbWU6IFwiQ2RrU3RhY2tKYXZhQXBwSW5zdGFuY2VcIixcbiAgICAgIHVzZXJEYXRhOiB1c2VyRGF0YSxcbiAgICAgIHJvbGU6IHJvbGUsXG4gICAgICByZXNvdXJjZVNpZ25hbFRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMTApXG4gICAgfSkuaW5zdGFuY2U7XG5cbiAgICBUYWcuYWRkKGluc3RhbmNlLCAnTmFtZScsICdDZGtTdGFja0phdmFBcHBJbnN0YW5jZScpO1xuXG4gICAgLy8gVXNlciBkYXRhIGNvbW1hbmRzIGZvciBFYzIgaW5zdGFuY2VcbiAgICB1c2VyRGF0YS5hZGRDb21tYW5kcyhcbiAgICAgICdleGVjID4gPih0ZWUgL3Zhci9sb2cvdXNlci1kYXRhLmxvZ3xsb2dnZXIgLXQgdXNlci1kYXRhIC1zIDI+L2Rldi9jb25zb2xlKSAyPiYxJyxcbiAgICAgICd5dW0gaW5zdGFsbCAteSB0bXV4IGpxIGphdmEtMTEtYW1hem9uLWNvcnJldHRvLWhlYWRsZXNzIHJ1YnknLFxuICAgICAgJ2NkIC9ob21lL2VjMi11c2VyJyxcbiAgICAgIGB3Z2V0IGh0dHBzOi8vZDFvc2czNW55Ym4zdHQuY2xvdWRmcm9udC5uZXQvY29tL2FtYXpvbmF3cy9jb2RlZ3VydS1wcm9maWxlci1qYXZhLWFnZW50LXN0YW5kYWxvbmUvMS4wLjAvY29kZWd1cnUtcHJvZmlsZXItamF2YS1hZ2VudC1zdGFuZGFsb25lLTEuMC4wLmphcmAsXG4gICAgICAneXVtIGluc3RhbGwgLXkgYXdzLWNsaScsXG4gICAgICAnY2QgL3RtcCcsXG4gICAgICBgd2dldCBodHRwczovL2F3cy1jb2RlZGVwbG95LSR7Y2RrLkF3cy5SRUdJT059LnMzLmFtYXpvbmF3cy5jb20vbGF0ZXN0L2NvZGVkZXBsb3ktYWdlbnQubm9hcmNoLnJwbSAtUCAvdG1wYCxcbiAgICAgICdzdWRvIHl1bSAteSBpbnN0YWxsIC90bXAvY29kZWRlcGxveS1hZ2VudC5ub2FyY2gucnBtJyxcbiAgICAgICdzdWRvIHNlcnZpY2UgY29kZWRlcGxveS1hZ2VudCBzdGF0dXMnLFxuICAgICAgYC9vcHQvYXdzL2Jpbi9jZm4tc2lnbmFsIC1lICQ/IC0tc3RhY2sgJHtjZGsuQXdzLlNUQUNLX05BTUV9IC0tcmVzb3VyY2UgJHtpbnN0YW5jZS5sb2dpY2FsSWR9IC0tcmVnaW9uICR7Y2RrLkF3cy5SRUdJT059YFxuICAgICk7XG4gICAgXG4gICAgLy8gU1FTIFF1ZXVlXG4gICAgY29uc3QgcXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdTUVNfcXVldWUnKTtcbiAgfVxufVxuIl19