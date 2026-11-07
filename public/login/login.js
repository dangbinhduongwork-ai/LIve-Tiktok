const form = document.getElementById('loginForm');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  const input = document.getElementById('token');
  const message = document.getElementById('message');
  button.disabled = true;
  message.textContent = '';
  try {
    const response = await fetch('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: input.value.trim() })
    });
    input.value = '';
    if (response.ok) location.replace('/admin/');
    else message.textContent = (await response.json()).error || 'Không thể đăng nhập.';
  } catch {
    message.textContent = 'Không kết nối được server. Hãy thử lại.';
  } finally {
    button.disabled = false;
  }
});
