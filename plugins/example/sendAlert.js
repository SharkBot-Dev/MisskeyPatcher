const stream = await api.reuseMisskeyStream();

stream.channel('localTimeline', {}, (message) => {
  api.toast(`${message?.user?.name}: ` + message.text)
});