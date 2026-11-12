/* Чат участников: следующее сообщение появляется после индикатора набора, «Показать всё» проигрывает остаток. */
const { $, $$ } = window.Course;
const TYPING_MS = 800;
const AUTOPLAY_MS = 1200;

function createChat(root) {
  const messages = $$('.chat-message', root);
  const typing = $('.chat-typing', root);
  const typingAvatar = $('.chat-avatar', typing);
  const progress = $('.chat-progress', root);
  let shown = 0;
  let timer = null;

  const renderProgress = () => { progress.textContent = `${shown} / ${messages.length} сообщений`; };

  function reveal(message) {
    typing.style.display = 'none';
    message.style.display = 'flex';
    shown += 1;
    timer = null;
    renderProgress();
  }

  function showNext() {
    if (timer || shown >= messages.length) return;
    const message = messages[shown];
    const avatar = $('.chat-avatar', message);
    typingAvatar.textContent = avatar.textContent;
    typingAvatar.style.background = avatar.style.background;
    typing.style.display = 'flex';
    timer = setTimeout(() => reveal(message), TYPING_MS);
  }

  function reset() {
    clearTimeout(timer);
    timer = null;
    shown = 0;
    messages.forEach(m => { m.style.display = 'none'; });
    typing.style.display = 'none';
    renderProgress();
  }

  return { showNext, reset, isDone: () => shown >= messages.length, renderProgress };
}

function wire(root) {
  const chat = createChat(root);
  $('.chat-next-btn', root).addEventListener('click', chat.showNext);
  $('.chat-reset-btn', root).addEventListener('click', chat.reset);
  $('.chat-all-btn', root).addEventListener('click', () => {
    const autoplay = setInterval(() => (chat.isDone() ? clearInterval(autoplay) : chat.showNext()), AUTOPLAY_MS);
  });
  chat.renderProgress();
}

$$('.chat-window').forEach(wire);
