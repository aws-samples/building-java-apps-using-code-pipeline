FROM amazoncorretto:11-alpine-jdk
# TODO3: Corretto

ENV KUBECONFIG /home/kubectl/.kube/kubeconfig
ENV HOME /home/kubectl
# ENV KUBECONFIG /root/.kube/kubeconfig

RUN apk add --no-cache curl tar bash procps

# Downloading and installing Maven
ARG MAVEN_VERSION=3.6.3
ARG USER_HOME_DIR="/root"
ARG SHA=b4880fb7a3d81edd190a029440cdf17f308621af68475a4fe976296e71ff4a4b546dd6d8a58aaafba334d309cc11e638c52808a4b0e818fc0fd544226d952544
ARG BASE_URL=https://apache.osuosl.org/maven/maven-3/${MAVEN_VERSION}/binaries

# RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip
# RUN ls -altr
# RUN ./aws/install
ENV GLIBC_VER=2.31-r0

# install glibc compatibility for alpine
RUN apk --no-cache add \
        binutils \
        curl \
    && curl -sL https://alpine-pkgs.sgerrand.com/sgerrand.rsa.pub -o /etc/apk/keys/sgerrand.rsa.pub \
    && curl -sLO https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VER}/glibc-${GLIBC_VER}.apk \
    && curl -sLO https://github.com/sgerrand/alpine-pkg-glibc/releases/download/${GLIBC_VER}/glibc-bin-${GLIBC_VER}.apk \
    && apk add --no-cache \
        glibc-${GLIBC_VER}.apk \
        glibc-bin-${GLIBC_VER}.apk \
    && curl -sL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip \
    && unzip awscliv2.zip \
    && aws/install \
    && rm -rf \
        awscliv2.zip \
        aws \
        /usr/local/aws-cli/v2/*/dist/aws_completer \
        /usr/local/aws-cli/v2/*/dist/awscli/data/ac.index \
        /usr/local/aws-cli/v2/*/dist/awscli/examples \
    && apk --no-cache del \
        binutils \
        curl \
    && rm glibc-${GLIBC_VER}.apk \
    && rm glibc-bin-${GLIBC_VER}.apk \
    && rm -rf /var/cache/apk/*

RUN aws --version
RUN apk --no-cache add \
        binutils \
        curl \  
  && mkdir -p /usr/share/maven /usr/share/maven/ref \
  && echo "Downlaoding maven" \
  && curl -fsSL -o /tmp/apache-maven.tar.gz ${BASE_URL}/apache-maven-${MAVEN_VERSION}-bin.tar.gz \
  \
  && echo "Unziping maven" \
  && tar -xzf /tmp/apache-maven.tar.gz -C /usr/share/maven --strip-components=1 \
  \
  && echo "Cleaning and setting links" \
  && rm -f /tmp/apache-maven.tar.gz \
  && ln -s /usr/share/maven/bin/mvn /usr/bin/mvn

RUN apk --no-cache add \
        binutils \
        curl \
  && curl -Lo snyk "https://github.com/snyk/snyk/releases/download/v1.210.0/snyk-linux" \
	&& mv snyk /usr/local/bin/snyk 
RUN chmod -R +x /usr/local/bin/snyk 
ENV MAVEN_HOME /usr/share/maven
ENV MAVEN_CONFIG "$USER_HOME_DIR/.m2"

RUN \
	# mkdir /root/bin /aws; \
	apk -Uuv add groff less bash python3 py-pip jq curl docker && \
	pip3 install --upgrade pip; \
	# pip3 install awscli && \
	rm /var/cache/apk/* && \
	# Create non-root user (with a randomly chosen UID/GUI).
	adduser kubectl -Du 5566

ADD https://amazon-eks.s3-us-west-2.amazonaws.com/1.14.6/2019-08-22/bin/linux/amd64/kubectl /usr/local/bin/kubectl
#COPY kubectl /usr/local/bin/kubectl

WORKDIR $HOME

COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod a+x /usr/local/bin/kubectl /usr/local/bin/entrypoint.sh


# USER kubectl
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
