FROM alpine:latest

RUN apk add --no-cache curl python3

WORKDIR /app

ADD ./helper.py /app

#Port to listen on
ENV VIS_HELPER_PORT=8081

EXPOSE 8081

#You have to mount /var/run/docker.sock to the same location on the container
CMD ["python3","helper.py"]
