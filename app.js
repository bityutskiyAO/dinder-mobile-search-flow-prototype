/* PROTOTYPE ONLY — deliberately minimal, in-memory, and disconnected from any backend. */

const VARIANTS = [
  {key: "A", name: "Один фокус"},
  {key: "B", name: "Пульт выбора"},
  {key: "C", name: "История группы"},
  {key: "D", name: "Гибрид"},
];

const SCENES = [
  {id: "home", label: "1. Главная", domainState: "guest_home", connection: "online"},
  {id: "join", label: "2. Вход по коду", domainState: "guest_home", connection: "online"},
  {id: "configuring", label: "3. Ожидание и фильтры", domainState: "configuring", connection: "online"},
  {id: "group", label: "3а. Группа и события", domainState: "configuring", connection: "online", hybridOnly: true},
  {id: "filters", label: "3б. Фильтры заведений", domainState: "configuring", connection: "online", hybridOnly: true, hostOnly: true},
  {id: "settings", label: "3в. Общие параметры", domainState: "configuring", connection: "online", hybridOnly: true, hostOnly: true},
  {id: "loading", label: "4. Финальная проверка", domainState: "configuring", connection: "online"},
  {id: "voting", label: "5. Оценки и таймер", domainState: "round_active", connection: "online"},
  {id: "detail", label: "5а. Детали заведения", domainState: "round_active", connection: "online", hybridOnly: true},
  {id: "returning", label: "5б. Возврат участника", domainState: "round_active", connection: "online", hybridOnly: true},
  {id: "offline", label: "6. Разрыв связи", domainState: "round_active", connection: "offline"},
  {id: "expired", label: "7. Время вышло", domainState: "round_expired", connection: "online"},
  {id: "match", label: "8. Совпадение и решение организатора", domainState: "match_found", connection: "online"},
  {id: "no-match", label: "9. Без совпадения", domainState: "no_match", connection: "online"},
  {id: "history", label: "10. История выборов", domainState: "terminal_history", connection: "online"},
  {id: "empty", label: "11. Пустая история", domainState: "terminal_history", connection: "online"},
  {id: "profile", label: "12. Профиль", domainState: "identity_profile", connection: "online", hybridOnly: true},
];

const initialParams = new URLSearchParams(location.search);

const state = {
  variant: normalizeVariant(initialParams.get("variant")),
  scene: normalizeScene(initialParams.get("scene")),
  role: initialParams.get("role") === "participant" ? "participant" : "host",
  identity: initialParams.get("identity") === "user" ? "user" : "guest",
  profileConfirmation: null,
  profileMessage: null,
  profileReturnScene: "home",
  localVotes: 3,
  photoIndex: 0,
  eventsExpanded: false,
  timerSeconds: 5 * 60,
};

let autoStartTimeout;
let countdownInterval;

function normalizeVariant(value) {
  return VARIANTS.some((item) => item.key === value) ? value : "D";
}

function normalizeScene(value) {
  return SCENES.some((item) => item.id === value) ? value : "home";
}

function currentScene() {
  return SCENES.find((item) => item.id === state.scene);
}

function roleName() {
  return state.role === "host" ? "Организатор" : "Участник";
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set("variant", state.variant);
  url.searchParams.set("scene", state.scene);
  url.searchParams.set("role", state.role);
  url.searchParams.set("identity", state.identity);
  history.replaceState(null, "", url);
}

function setScene(scene) {
  const previousScene = state.scene;
  if (scene === "profile" && previousScene !== "profile") state.profileReturnScene = previousScene;
  state.scene = normalizeScene(scene);
  if (state.scene === "voting" && previousScene !== "voting") state.timerSeconds = 5 * 60;
  syncUrl();
  render();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function cycleVariant(direction) {
  const index = VARIANTS.findIndex((item) => item.key === state.variant);
  state.variant = VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length].key;
  const scene = currentScene();
  if (state.variant !== "D" && scene.hybridOnly) state.scene = "configuring";
  if (state.variant === "D" && scene.hostOnly && state.role !== "host") state.scene = "group";
  syncUrl();
  render();
}

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => element.classList.remove("visible"), 1800);
}

function sceneOptions() {
  const availableScenes = SCENES.filter((scene) => {
    if (scene.hybridOnly && state.variant !== "D") return false;
    if (scene.hostOnly && state.role !== "host") return false;
    return true;
  });
  return availableScenes.map(
    (scene) => `<option value="${scene.id}" ${scene.id === state.scene ? "selected" : ""}>${scene.label}</option>`,
  ).join("");
}

function toolbar() {
  return `
    <div class="prototype-toolbar" data-prototype-only>
      <label>Состояние прототипа
        <select id="scene-select" aria-label="Выбрать состояние сценария">${sceneOptions()}</select>
      </label>
      <button class="role-toggle" data-action="toggle-role" title="Сменить точку зрения">${roleName()}</button>
    </div>`;
}

function variantSwitcher() {
  const current = VARIANTS.find((item) => item.key === state.variant);
  return `
    <nav class="prototype-switcher" aria-label="Варианты прототипа" data-prototype-only>
      <button data-action="previous-variant" aria-label="Предыдущий вариант">←</button>
      <div class="prototype-switcher-label">${current.key} — ${current.name}</div>
      <button data-action="next-variant" aria-label="Следующий вариант">→</button>
    </nav>`;
}

function statusPill() {
  const scene = currentScene();
  const mode = scene.connection === "offline" ? "warning" : scene.domainState.includes("history") || scene.domainState === "no_match" ? "terminal" : "online";
  const labels = {
    home: "Готовы начать",
    join: "Приглашение",
    configuring: "Собираемся",
    group: "Группа собирается",
    filters: "Настройка",
    settings: "Настройка",
    loading: "Проверяем",
    voting: "Оцениваем",
    detail: "Оцениваем",
    returning: "Выбор активен",
    offline: "Нет связи",
    expired: "Ждём организатора",
    match: "Совпадение",
    "no-match": "Завершена",
    history: "История",
    empty: "История",
    profile: "Профиль",
  };
  const text = labels[state.scene];
  return `<span class="status-pill ${mode}">${text}</span>`;
}

function avatars() {
  return `<div class="avatar-row" aria-label="4 участника"><span class="avatar">ВЫ</span><span class="avatar">МК</span><span class="avatar">АЛ</span><span class="avatar more">+1</span></div>`;
}

function domainStateDebug() {
  const scene = currentScene();
  const outsideSession = ["home", "join", "profile"].includes(scene.id);
  const stateLabels = {
    home: "главная",
    join: "вход по приглашению",
    configuring: "настройка",
    group: "группа собирается",
    filters: "настройка фильтров",
    settings: "общие параметры",
    loading: "проверка заведений",
    voting: "идёт оценка",
    detail: "детали заведения",
    returning: "возврат в активный выбор",
    offline: "восстановление связи",
    expired: "время этапа вышло",
    match: "совпадение найдено",
    "no-match": "совпадение не найдено",
    history: "завершено",
    empty: "история пуста",
    profile: "профиль пользователя",
  };
  const debugState = {
    "Профиль": state.identity === "user" ? "пользователь" : "гость",
    "Ваша роль": roleName(),
    "Состояние": stateLabels[scene.id],
    "Связь": scene.connection === "offline" ? "нет связи" : "подключено",
    "Участников": outsideSession ? 0 : 4,
    "Голосующих участников": outsideSession ? 0 : 4,
    "Заведений в списке": ["voting", "detail", "returning", "offline", "expired", "match", "no-match", "history"].includes(scene.id) ? 20 : null,
    "Этап": ["voting", "detail", "returning", "offline", "expired"].includes(scene.id) ? "1 из 2" : null,
    "Ваших оценок": state.localVotes,
  };
  return `<details class="state-debug"><summary>Состояние сценария</summary><pre>${JSON.stringify(debugState, null, 2)}</pre></details>`;
}

function commonHomeActions() {
  return `<div class="stack"><button class="button primary" data-scene="configuring">Создать совместный выбор</button><button class="button secondary" data-scene="join">Войти по коду</button><button class="button ghost" data-scene="history">История выборов</button></div>`;
}

function joinForm() {
  return `<div class="stack"><label class="field"><span>Код приглашения</span><input value="M7K-4QA" inputmode="text" aria-label="Код приглашения" /></label><button class="button primary" data-action="join-session">Присоединиться</button><p class="helper">Аккаунт Яндекса не требуется. Новый гость создаётся автоматически.</p></div>`;
}

function configurationSummary() {
  return `
    <div class="stack">
      <div class="cluster"><span class="chip">Москва</span><span class="chip">Итальянская</span><span class="chip">₽₽</span><span class="chip">Без метро</span></div>
      <div class="control-list">
        <div><span>Предварительно подходит</span><strong>34 заведения</strong></div>
        <div><span>Будет выбрано</span><strong>до 20</strong></div>
        <div><span>Длительность этапа</span><strong>5 минут</strong></div>
      </div>
      <p class="helper">Фактический список фиксируется только после свежей проверки фотографий.</p>
    </div>`;
}

function placeContent() {
  return `
    <div class="place-photo" role="img" aria-label="Интерьер ресторана Lila"></div>
    <div>
      <p class="eyebrow">Заведение 4 из 10 · этап 1 из 2</p>
      <h2>Lila</h2>
      <div class="cluster"><span class="chip">Итальянская</span><span class="chip">Паста</span><span class="chip">₽₽</span></div>
      <p class="helper">Чистые пруды · 620 м от метро</p>
    </div>`;
}

function historyList() {
  return `
    <div class="control-list">
      <div><span><strong>Lila</strong><br /><small>Вчера · завершено · организатор</small></span><span>→</span></div>
      <div><span><strong>Без совпадения</strong><br /><small>12 сентября · 4 участника</small></span><span>→</span></div>
      <div><span><strong>Отменено</strong><br /><small>3 сентября · участник</small></span><span>→</span></div>
    </div>`;
}

function primaryActions(scene, layout = "focus") {
  const gridClass = layout === "focus" ? "focus-action" : "stack";
  const wide = layout === "focus" ? "wide" : "";
  if (scene === "configuring") {
    return state.role === "host"
      ? `<div class="${gridClass}"><button class="button primary ${wide}" data-scene="loading">Проверить список и начать</button><button class="button secondary ${wide}" data-action="copy-code">Скопировать M7K-4QA</button></div>`
      : `<div class="${gridClass}"><button class="button secondary ${wide}" disabled>Ждём, когда организатор начнёт</button></div>`;
  }
  if (scene === "voting") {
    return `<div class="${gridClass}"><button class="button secondary" data-action="vote-no">Не подходит</button><button class="button accent" data-action="vote-yes">Хочу</button></div>`;
  }
  if (scene === "offline") {
    return `<div class="${gridClass}"><button class="button primary ${wide}" data-action="reconnect">Повторить синхронизацию</button></div>`;
  }
  if (scene === "expired") {
    return state.role === "host"
      ? `<div class="${gridClass}"><button class="button secondary" data-action="extend">Ещё 5 минут</button><button class="button primary" data-scene="match">Завершить этап</button></div>`
      : `<div class="${gridClass}"><button class="button secondary ${wide}" disabled>Организатор решает: продлить или завершить</button></div>`;
  }
  if (scene === "match") {
    return state.role === "host"
      ? `<div class="${gridClass}"><button class="button secondary" data-scene="no-match">Продолжить поиск</button><button class="button accent" data-scene="history">Выбрать Lila</button></div>`
      : `<div class="${gridClass}"><button class="button secondary ${wide}" disabled>Ждём решения организатора</button></div>`;
  }
  if (scene === "no-match") {
    return `<div class="${gridClass}"><button class="button primary ${wide}" data-scene="configuring">Новый совместный выбор</button><button class="button ghost ${wide}" data-scene="history">Перейти в историю</button></div>`;
  }
  return "";
}

function focusContent(scene) {
  if (scene === "home") return `<div><p class="eyebrow">Выбирайте вместе, оценивайте отдельно</p><h1>Куда пойдём?</h1><p class="muted">DINDER находит заведение, которое подходит всей группе.</p></div>${commonHomeActions()}`;
  if (scene === "join") return `<div><p class="eyebrow">Приглашение</p><h1>Войти в группу</h1><p class="muted">Попросите организатора прислать короткий код.</p></div>${joinForm()}`;
  if (scene === "configuring") return `<div><p class="eyebrow">Совместный выбор · M7K-4QA</p><h1>${state.role === "host" ? "Настройте поиск" : "Группа собирается"}</h1><div class="focus-code">M7K-4QA</div></div><div class="stack"><div class="control-card-row">${avatars()}<strong>4 участника</strong></div>${configurationSummary()}${primaryActions(scene)}</div>`;
  if (scene === "loading") return `<div class="empty-illustration">↻</div><div><p class="eyebrow">Фиксируем список</p><h1>Проверяем 34 заведения</h1><p class="muted">Обновляем фотографии, доступность и соответствие фильтрам. Совместный выбор остаётся на этапе настройки.</p></div><div class="progress" style="--progress: 68%"><span></span></div><button class="button primary" data-scene="voting">Показать успешную проверку</button>`;
  if (scene === "voting") return `${placeContent()}<div class="control-card-row"><span class="chip">Осталось 04:12</span><span class="helper">Вы оценили ${state.localVotes}/10</span></div>${primaryActions(scene)}`;
  if (scene === "offline") return `<div class="empty-illustration">⌁</div><div><p class="eyebrow">Оценка сохранена на устройстве</p><h1>Связь потеряна</h1><p class="muted">Сначала загрузим актуальное состояние. До синхронизации новые оценки недоступны.</p></div><div class="notice">Результат последней оценки пока не подтверждён. После восстановления связи повторим тот же запрос.</div>${primaryActions(scene)}`;
  if (scene === "expired") return `<div><p class="eyebrow">Этап 1 из 2</p><h1>Время вышло</h1><p class="muted">Оценки приостановлены. Пропущенные оценки станут отрицательными, только если организатор завершит этап.</p></div><div class="control-card-row"><div class="metric"><strong>31/40</strong><span>оценок получено</span></div><div class="metric"><strong>4</strong><span>участника</span></div></div>${primaryActions(scene)}`;
  if (scene === "match") return `${placeContent()}<div><p class="eyebrow">Совпадение найдено</p><h1>Вся группа за Lila</h1><p class="muted">Совпадение не является бронированием. ${state.role === "host" ? "Подтвердите заведение или продолжите поиск." : "Организатор выбирает: подтвердить или продолжить."}</p></div>${primaryActions(scene)}`;
  if (scene === "no-match") return `<div class="empty-illustration">×</div><div><p class="eyebrow">Совместный выбор завершён</p><h1>Совпадение не найдено</h1><p class="muted">Подходящего общего выбора не нашлось. Оценки других участников остаются скрытыми.</p></div>${primaryActions(scene)}`;
  if (scene === "history") return `<div><p class="eyebrow">Только завершённые совместные выборы</p><h1>История выборов</h1><p class="muted">Другим людям не видны ваши оценки, а вам — их оценки.</p></div>${historyList()}<button class="button secondary" data-scene="home">На главную</button>`;
  return `<div class="empty-illustration">○</div><div><p class="eyebrow">История выборов</p><h1>Здесь пока пусто</h1><p class="muted">Активные совместные выборы появятся отдельно. История начнётся после первого завершения.</p></div><button class="button primary" data-scene="home">Начать поиск</button>`;
}

function renderFocus() {
  const topAligned = ["configuring", "voting", "match", "history"].includes(state.scene) ? "top" : "";
  return `
    <main class="focus-layout">
      <header class="focus-topline"><span class="brand">DINDER</span>${statusPill()}</header>
      <section class="focus-stage ${topAligned}">${focusContent(state.scene)}</section>
      ${domainStateDebug()}
    </main>`;
}

function dashboardMain(scene) {
  if (scene === "home") return `<section class="control-card"><h2>Быстрый старт</h2><p class="muted">Создайте совместный выбор или войдите по коду без обязательной регистрации.</p>${commonHomeActions()}</section><section class="control-card"><h3>Активных совместных выборов нет</h3><p class="helper">Новый гость уже создан на этом устройстве.</p></section>`;
  if (scene === "join") return `<section class="control-card"><h2>Вход по коду</h2>${joinForm()}</section><section class="control-card"><h3>Что увидят другие?</h3><p class="helper">Только ваше сгенерированное имя и аватар.</p></section>`;
  if (scene === "configuring") return `<section class="control-card critical"><div class="control-card-row"><div><p class="eyebrow">Следующее действие</p><h2>${state.role === "host" ? "Запустите проверку списка" : "Ожидайте запуска"}</h2></div>${avatars()}</div>${primaryActions(scene, "control")}</section><section class="control-card"><h3>Фильтры и список</h3>${configurationSummary()}</section>`;
  if (scene === "loading") return `<section class="control-card critical"><p class="eyebrow">Операция выполняется</p><h2>Обновляем фотографии</h2><div class="progress" style="--progress: 68%"><span></span></div><p class="helper">Проверено 23 из 34 кандидатов. Зафиксируем до 20 заведений.</p><button class="button primary" data-scene="voting">Показать результат</button></section><section class="control-card"><h3>Почему это нужно</h3><p class="helper">Предварительное число могло устареть. Если останется меньше двух заведений, вернёмся к настройке.</p></section>`;
  if (scene === "voting") return `<section class="control-card">${placeContent()}${primaryActions(scene, "control")}</section><section class="control-card"><div class="control-card-row"><strong>Ваш прогресс</strong><span>${state.localVotes}/10</span></div><div class="progress" style="--progress:${state.localVotes * 10}%"><span></span></div></section>`;
  if (scene === "offline") return `<section class="control-card critical"><h2>Синхронизация остановлена</h2><div class="notice">Отсутствие связи не расходует три автоматические попытки. Последняя оценка ждёт подтверждения.</div>${primaryActions(scene, "control")}</section><section class="control-card"><h3>Безопасное восстановление</h3><p class="helper">Восстанавливаем связь → загружаем актуальное состояние → проверяем действие → повторяем тот же запрос.</p></section>`;
  if (scene === "expired") return `<section class="control-card critical"><p class="eyebrow">Требуется решение ${state.role === "host" ? "организатора" : "от организатора"}</p><h2>Этап остановлен</h2>${primaryActions(scene, "control")}</section><section class="control-card"><h3>Состояние оценок</h3><div class="control-list"><div><span>Получено</span><strong>31</strong></div><div><span>Отсутствует</span><strong>9</strong></div></div></section>`;
  if (scene === "match") return `<section class="control-card critical"><p class="eyebrow">Совпадение · решение организатора</p><h2>Lila</h2><p class="muted">Строго больше 50% положительных оценок.</p>${primaryActions(scene, "control")}</section><section class="control-card"><div class="place-photo"></div></section>`;
  if (scene === "no-match") return `<section class="control-card critical"><h2>Совпадение не найдено</h2><p class="muted">Совместный выбор завершён. Новые участники и оценки не принимаются.</p>${primaryActions(scene, "control")}</section><section class="control-card"><h3>Что сохранится</h3><p class="helper">Фильтры, роль, число участников и только ваши оценки — на 180 дней.</p></section>`;
  if (scene === "history") return `<section class="control-card"><div class="control-card-row"><h2>История выборов</h2><span class="chip">180 дней</span></div>${historyList()}</section><section class="control-card"><button class="button secondary" data-scene="home">На главную</button></section>`;
  return `<section class="control-card"><div class="empty-illustration">○</div><h2>Нет завершённых совместных выборов</h2><p class="muted">Активные совместные выборы отображаются отдельно от истории.</p><button class="button primary" data-scene="home">Начать поиск</button></section>`;
}

function renderControl() {
  return `
    <main class="control-layout">
      <header class="control-header">
        <div class="control-header-row"><span class="brand">DINDER</span>${statusPill()}</div>
        <div class="control-header-row"><div><strong>${state.scene === "home" || state.scene === "join" ? "Гость" : "Совместный выбор M7K-4QA"}</strong><div class="muted">${roleName()}</div></div>${state.scene === "home" || state.scene === "join" ? "" : avatars()}</div>
        <div class="control-metrics"><div class="metric"><strong>${["home", "join"].includes(state.scene) ? "—" : "4"}</strong><span>Участники</span></div><div class="metric"><strong>${["voting", "offline", "expired"].includes(state.scene) ? "1/2" : "—"}</strong><span>Этап</span></div><div class="metric"><strong>${state.scene === "voting" ? "04:12" : state.scene === "expired" ? "00:00" : "—"}</strong><span>Таймер</span></div></div>
      </header>
      <div class="control-content">${dashboardMain(state.scene)}${domainStateDebug()}</div>
    </main>`;
}

function timelineEvents(scene) {
  const base = [
    ["ОР", "Вы начали совместный выбор", "Код M7K-4QA · 18:04"],
    ["МК", "Маша присоединилась", "Гость · 18:05"],
    ["АЛ", "Алексей присоединился", "Пользователь · 18:06"],
  ];
  if (["loading", "voting", "offline", "expired", "match", "no-match", "history"].includes(scene)) base.push(["20", "Список из 20 заведений зафиксирован", "2 этапа по 10 · 18:08"]);
  if (["voting", "offline", "expired", "match", "no-match", "history"].includes(scene)) base.push(["Э1", "Первый этап начался", "Оценки участников скрыты · 18:08"]);
  if (["expired", "match", "no-match", "history"].includes(scene)) base.push(["00", "Время этапа закончилось", "Новые оценки приостановлены · 18:18"]);
  if (["match", "history"].includes(scene)) base.push(["✓", "Найдено совпадение: Lila", "Ожидается решение организатора · 18:19"]);
  if (scene === "no-match") base.push(["×", "Общего выбора нет", "Совместный выбор завершён · 18:19"]);
  if (scene === "history") base.push(["✓", "Организатор выбрал Lila", "Совместный выбор завершён · 18:20"]);
  if (scene === "join") return [["→", "Вы открыли приглашение", "Осталось ввести код"]];
  if (scene === "home" || scene === "empty") return [];
  return base;
}

function timelineMarkup(scene) {
  const events = timelineEvents(scene);
  if (!events.length) return `<p class="helper">События группы появятся здесь после создания совместного выбора.</p>`;
  return events.map(([dot, title, meta]) => `<div class="timeline-item"><span class="timeline-dot">${dot}</span><div class="timeline-copy"><strong>${title}</strong><span class="muted">${meta}</span></div></div>`).join("");
}

function storySheet(scene) {
  if (scene === "home") return `<p class="eyebrow">Начните историю группы</p><h2>Куда пойдём?</h2>${commonHomeActions()}`;
  if (scene === "join") return `<p class="eyebrow">Приглашение</p><h2>Присоединиться</h2>${joinForm()}`;
  if (scene === "configuring") return `<div class="control-card-row"><div><p class="eyebrow">4 участника</p><h2>${state.role === "host" ? "Можно начинать" : "Ожидаем организатора"}</h2></div>${avatars()}</div>${primaryActions(scene, "story")}`;
  if (scene === "loading") return `<p class="eyebrow">Системное событие</p><h2>Проверяем доступность заведений</h2><div class="progress" style="--progress:68%"><span></span></div><p class="helper">Проверено 23 из 34</p><button class="button primary" data-scene="voting">Показать результат</button>`;
  if (scene === "voting") return `${placeContent()}${primaryActions(scene, "story")}`;
  if (scene === "offline") return `<p class="eyebrow">Сохранено на устройстве</p><h2>Нет связи</h2><div class="notice">Последняя оценка не потеряна и ждёт подтверждения. Новые действия станут доступны после загрузки актуального состояния.</div>${primaryActions(scene, "story")}`;
  if (scene === "expired") return `<p class="eyebrow">Группа ждёт решения</p><h2>Этап остановлен</h2><p class="muted">Получена 31 из 40 оценок.</p>${primaryActions(scene, "story")}`;
  if (scene === "match") return `<p class="eyebrow">Общий момент</p><h2>Совпадение: Lila</h2><p class="muted">${state.role === "host" ? "Ваше решение завершит поиск или вернёт группу к оценкам." : "Организатор принимает финальное решение."}</p>${primaryActions(scene, "story")}`;
  if (scene === "no-match") return `<p class="eyebrow">Финал</p><h2>Совпадение не найдено</h2><p class="muted">История группы сохранена без раскрытия чужих оценок.</p>${primaryActions(scene, "story")}`;
  if (scene === "history") return `<p class="eyebrow">История выборов · 180 дней</p><h2>Ваши завершённые поиски</h2>${historyList()}`;
  return `<p class="eyebrow">История выборов</p><h2>Здесь пока пусто</h2><p class="muted">Первый завершённый совместный выбор станет первой записью.</p><button class="button primary" data-scene="home">Начать поиск</button>`;
}

function renderStory() {
  return `
    <main class="story-layout">
      <header class="story-header"><div><span class="brand">DINDER</span><p class="muted">${state.scene === "home" || state.scene === "join" ? "Ваши совместные поиски" : "Совместный выбор M7K-4QA"}</p></div>${statusPill()}</header>
      <section class="timeline">${timelineMarkup(state.scene)}</section>
      ${domainStateDebug()}
      <section class="story-sheet">${storySheet(state.scene)}</section>
    </main>`;
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function timerValue() {
  return `<span data-timer>${formatTimer(state.timerSeconds)}</span>`;
}

function profileEntry() {
  const authenticated = state.identity === "user";
  return `<button class="profile-entry" data-scene="profile" aria-label="Открыть профиль"><span>${authenticated ? "АН" : "Г"}</span><small>${authenticated ? "Анна" : "Гость"}</small></button>`;
}

function hybridHeader() {
  const active = !["home", "join", "history", "empty", "profile"].includes(state.scene);
  if (!active) {
    return `<header class="hybrid-header compact"><div class="control-header-row"><span class="brand">DINDER</span><div class="header-actions">${statusPill()}${profileEntry()}</div></div></header>`;
  }
  const preparing = ["configuring", "group", "filters", "settings", "loading"].includes(state.scene);
  const timerVisible = ["voting", "detail", "returning", "offline", "expired"].includes(state.scene);
  const timerExpired = state.scene === "expired";
  const progressValue = preparing ? (state.scene === "loading" ? "Проверка" : "Настройка") : `${state.localVotes} из 10`;
  const progressLabel = preparing ? "состояние" : "вы оценили";
  return `
    <header class="hybrid-header">
      <div class="control-header-row"><span class="brand">DINDER</span><div class="header-actions">${statusPill()}${profileEntry()}</div></div>
      <div class="hybrid-session-row">
        <div><span class="helper light">Активный совместный выбор</span><strong>M7K-4QA</strong><span class="hybrid-role">${roleName()}</span></div>
        ${avatars()}
      </div>
      <nav class="hybrid-nav" aria-label="Разделы совместного выбора">
        <button data-scene="group">Группа</button>
        ${state.role === "host" ? '<button data-scene="filters">Фильтры</button><button data-scene="settings">Параметры</button>' : ""}
      </nav>
      <div class="hybrid-summary">
        <div class="metric"><strong>4</strong><span>участника</span></div>
        <div class="metric"><strong>${progressValue}</strong><span>${progressLabel}</span></div>
      </div>
      ${timerVisible ? `<div class="hybrid-timer ${timerExpired ? "expired" : ""}"><span>${timerExpired ? "Время этапа вышло" : "До конца этапа"}</span><strong>${timerExpired ? "00:00" : timerValue()}</strong><small>Этап 1 из 2</small></div>` : ""}
    </header>`;
}

function hybridEvents() {
  const events = [
    ["18:04", state.role === "host" ? "Вы начали совместный выбор" : "Анна начала совместный выбор", "Организатор"],
    ["18:05", "Маша присоединилась", "Участник"],
    ["18:06", "Фильтры обновлены", "Итальянская · средний чек"],
    ["18:07", "Денис вышел из группы", "Он сможет вернуться"],
    ["18:08", "Алексей присоединился", "Участник"],
  ];
  if (state.scene === "loading") {
    events.push(["18:09", "Началась проверка заведений", "Проверяем фотографии и доступность"]);
  }
  const visibleEvents = state.eventsExpanded ? events : events.slice(-3);
  return `
    <section class="hybrid-events-card">
      <div class="control-card-row"><div><p class="eyebrow">События группы</p><h3>${state.eventsExpanded ? "Вся история" : "Последние изменения"}</h3></div><button class="button ghost compact-button" data-action="toggle-events">${state.eventsExpanded ? "Свернуть" : "Показать все"}</button></div>
      <div class="hybrid-events">${visibleEvents.map(([time, title, meta]) => `<div class="hybrid-event"><time>${time}</time><span><strong>${title}</strong><small>${meta}</small></span></div>`).join("")}</div>
    </section>`;
}

function groupPanel() {
  const members = state.role === "host"
    ? `
        <div class="member-row"><span class="avatar host-avatar">ОР</span><span><strong>Вы</strong><small>Организатор · в сети</small></span><span class="member-state">★</span></div>
        <div class="member-row"><span class="avatar">МК</span><span><strong>Маша</strong><small>Участник · в сети</small></span><span class="member-state online-dot"></span></div>
        <div class="member-row"><span class="avatar">АЛ</span><span><strong>Алексей</strong><small>Участник · в сети</small></span><span class="member-state online-dot"></span></div>
        <div class="member-row"><span class="avatar more">ДН</span><span><strong>Денис</strong><small>Участник · вышел, может вернуться</small></span><span class="member-state away-dot"></span></div>`
    : `
        <div class="member-row"><span class="avatar host-avatar">АН</span><span><strong>Анна</strong><small>Организатор · в сети</small></span><span class="member-state">★</span></div>
        <div class="member-row"><span class="avatar">ВЫ</span><span><strong>Вы</strong><small>Участник · в сети</small></span><span class="member-state online-dot"></span></div>
        <div class="member-row"><span class="avatar">МК</span><span><strong>Маша</strong><small>Участник · в сети</small></span><span class="member-state online-dot"></span></div>
        <div class="member-row"><span class="avatar more">АЛ</span><span><strong>Алексей</strong><small>Участник · в сети</small></span><span class="member-state online-dot"></span></div>`;
  return `
    <section class="control-card hybrid-priority">
      <div class="control-card-row"><div><p class="eyebrow">Группа</p><h2>4 участника</h2></div><span class="chip">Код M7K-4QA</span></div>
      <div class="member-list">${members}</div>
      ${state.role === "host" ? '<button class="button secondary" data-action="copy-code">Скопировать приглашение</button>' : '<button class="button secondary" data-action="leave-to-home">Выйти на главную</button>'}
    </section>
    ${hybridEvents()}`;
}

function filtersPanel() {
  if (state.role !== "host") return `<section class="control-card"><h2>Фильтры задаёт организатор</h2><p class="muted">Вы увидите итоговые параметры перед началом.</p></section>`;
  return `
    <section class="control-card hybrid-priority">
      <p class="eyebrow">Шаг 1 из 2</p><h2>Какие заведения искать?</h2>
      <div class="filter-section"><strong>Город</strong><button class="filter-chip selected" aria-pressed="true" data-action="toggle-chip">Москва</button></div>
      <div class="filter-section"><strong>Кухня</strong><div class="cluster"><button class="filter-chip selected" aria-pressed="true" data-action="toggle-chip">Итальянская</button><button class="filter-chip" aria-pressed="false" data-action="toggle-chip">Грузинская</button><button class="filter-chip" aria-pressed="false" data-action="toggle-chip">Азиатская</button></div></div>
      <div class="filter-section"><strong>Тип блюд</strong><div class="cluster"><button class="filter-chip selected" aria-pressed="true" data-action="toggle-chip">Паста</button><button class="filter-chip" aria-pressed="false" data-action="toggle-chip">Пицца</button><button class="filter-chip" aria-pressed="false" data-action="toggle-chip">Завтраки</button></div></div>
      <div class="filter-section"><strong>Ценовая категория</strong><div class="cluster"><button class="filter-chip" aria-pressed="false" data-action="toggle-chip">Бюджетно</button><button class="filter-chip selected" aria-pressed="true" data-action="toggle-chip">Средний чек</button><button class="filter-chip" aria-pressed="false" data-action="toggle-chip">Выше среднего</button></div></div>
      <div class="notice info">Предварительно подходит 34 заведения. Перед стартом список будет проверен повторно.</div>
      <button class="button primary" data-scene="settings">Сохранить и настроить параметры</button>
    </section>`;
}

function settingsPanel() {
  if (state.role !== "host") return `<section class="control-card"><h2>Параметры задаёт организатор</h2><p class="muted">Ожидайте начала совместного выбора.</p></section>`;
  return `
    <section class="control-card hybrid-priority">
      <p class="eyebrow">Шаг 2 из 2</p><h2>Общие параметры</h2>
      <div class="setting-row"><span><strong>Длительность этапа</strong><small>После окончания можно продлить</small></span><div class="segmented"><button class="selected" data-action="select-duration">5 мин</button><button data-action="select-duration">10 мин</button><button data-action="select-duration">15 мин</button></div></div>
      <div class="setting-row"><span><strong>Максимум заведений</strong><small>Список фиксируется до завершения</small></span><strong>20</strong></div>
      <div class="setting-row"><span><strong>Вход новых участников</strong><small>Оценки начнутся с текущего этапа</small></span><strong>Разрешён</strong></div>
      <div class="setting-row"><span><strong>Организатор</strong><small>Настраивает и управляет таймером</small></span><strong>Вы</strong></div>
      <button class="button primary" data-scene="loading">Проверить данные и начать</button>
      <button class="button ghost" data-scene="filters">Вернуться к фильтрам</button>
    </section>`;
}

function photoGallery() {
  const labels = ["Интерьер", "Основной зал", "Летняя веранда"];
  return `
    <div class="detail-gallery" data-gallery>
      <div class="place-photo detail-photo photo-${state.photoIndex}" role="img" aria-label="${labels[state.photoIndex]} заведения Lila"></div>
      <button class="gallery-arrow previous" data-action="previous-photo" aria-label="Предыдущее фото">‹</button>
      <button class="gallery-arrow next" data-action="next-photo" aria-label="Следующее фото">›</button>
      <div class="gallery-dots" aria-label="Фото ${state.photoIndex + 1} из 3">${labels.map((_, index) => `<span class="${index === state.photoIndex ? "active" : ""}"></span>`).join("")}</div>
    </div>`;
}

function placeDetailsPanel() {
  return `
    <section class="place-details-panel">
      <div class="control-card-row"><button class="button ghost compact-button" data-scene="voting">← К оценке</button><span class="chip">Заведение 4 из 10</span></div>
      ${photoGallery()}
      <div class="place-detail-copy"><p class="eyebrow">Подробная информация</p><h1>Lila</h1><div class="cluster"><span class="chip">Итальянская кухня</span><span class="chip">Паста</span><span class="chip">Средний чек</span></div><p>Современная итальянская кухня, спокойный интерьер и большая летняя веранда.</p></div>
      <div class="control-list"><div><span>Адрес</span><strong>Сретенский бульвар, 8</strong></div><div><span>Ближайшее метро</span><strong>Чистые пруды · 620 м</strong></div><div><span>Средний чек</span><strong>2 400 ₽</strong></div></div>
      <div class="demo-map" role="img" aria-label="Демонстрационная карта с точкой заведения Lila"><span class="road road-one"></span><span class="road road-two"></span><span class="map-marker" aria-hidden="true">●</span><span class="map-label">Lila</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div>
      <div class="focus-action"><button class="button secondary" data-action="open-map">Открыть большую карту</button><button class="button accent" data-scene="voting">Вернуться к оценке</button></div>
    </section>`;
}

function hybridVotingPanel() {
  return `
    <section class="control-card hybrid-priority">
      <div class="control-card-row"><div><p class="eyebrow">Заведение 4 из 10 · этап 1 из 2</p><h2>Lila</h2></div></div>
      <button class="place-preview" data-action="open-details" aria-label="Открыть подробную информацию о Lila"><div class="place-photo" role="img" aria-label="Интерьер заведения Lila"></div><span>Подробнее · фотографии · карта →</span></button>
      <div class="cluster"><span class="chip">Итальянская кухня</span><span class="chip">Паста</span><span class="chip">Средний чек</span></div>
      ${primaryActions("voting", "control")}
    </section>
    <section class="control-card"><div class="control-card-row"><strong>Ваш прогресс</strong><span>${state.localVotes}/10</span></div><div class="progress" style="--progress:${state.localVotes * 10}%"><span></span></div></section>`;
}

function hybridExpiredPanel() {
  if (state.role === "host") {
    return `
      <section class="control-card hybrid-priority">
        <p class="eyebrow">Требуется ваше решение</p>
        <h2>Продлить этап или завершить?</h2>
        <p class="muted">Трое из четырёх участников закончили оценку. Девять оценок ещё не получены.</p>
        <div class="control-list"><div><span>Получено группой</span><strong>31 из 40</strong></div><div><span>Завершили этап</span><strong>3 из 4</strong></div></div>
        <div class="notice info">При завершении пропущенные оценки будут засчитаны как «Не подходит». При продлении участники получат ещё 5 минут.</div>
        ${primaryActions("expired", "control")}
      </section>`;
  }
  return `
    <section class="control-card hybrid-priority">
      <p class="eyebrow">Ожидаем решение организатора</p>
      <h2>Вы оценили ${state.localVotes} из 10 заведений</h2>
      <div class="personal-progress" aria-label="Ваш прогресс: ${state.localVotes} из 10"><div class="progress" style="--progress:${state.localVotes * 10}%"><span></span></div><strong>${10 - state.localVotes} без оценки</strong></div>
      <div class="decision-explainer"><div><span>Если этап продлят</span><strong>Появится ещё 5 минут, чтобы закончить</strong></div><div><span>Если этап завершат</span><strong>Пропущенные заведения получат «Не подходит»</strong></div></div>
      <div class="notice">Организатор выбирает, что делать дальше. Новые оценки пока недоступны.</div>
    </section>`;
}

function profileConfirmationPanel() {
  if (state.profileConfirmation === "logout") {
    return `
      <section class="control-card hybrid-priority profile-confirmation">
        <button class="button ghost compact-button" data-action="cancel-profile-action">← Назад к профилю</button>
        <p class="eyebrow">Выход на этом устройстве</p>
        <h2>Выйти из профиля?</h2>
        <p>Активный совместный выбор и история останутся привязаны к вашему профилю. Для доступа к ним потребуется снова войти через Яндекс ID.</p>
        <div class="notice info">После выхода на этом устройстве будет автоматически создан новый гостевой профиль.</div>
        <button class="button primary" data-action="confirm-logout">Выйти</button>
        <button class="button secondary" data-action="cancel-profile-action">Отмена</button>
      </section>`;
  }
  return `
    <section class="control-card hybrid-priority profile-confirmation">
      <button class="button ghost compact-button" data-action="cancel-profile-action">← Назад к профилю</button>
      <p class="eyebrow danger-text">Необратимое действие</p>
      <h2>Удалить профиль?</h2>
      <div class="decision-explainer">
        <div><span>Активный выбор, где вы организатор</span><strong>Будет отменён для всей группы</strong></div>
        <div><span>Другие активные выборы</span><strong>Ваши оценки перестанут учитываться в незавершённых этапах</strong></div>
        <div><span>Историческая активность</span><strong>Останется обезличенной и станет недоступна вам</strong></div>
        <div><span>Яндекс ID и сеансы браузера</span><strong>Будут отвязаны и удалены</strong></div>
      </div>
      <button class="button danger" data-action="confirm-delete-profile">Удалить профиль безвозвратно</button>
      <button class="button secondary" data-action="cancel-profile-action">Отмена</button>
    </section>`;
}

function profilePanel() {
  if (state.profileConfirmation) return profileConfirmationPanel();
  const backButton = `<button class="button ghost profile-back" data-scene="${state.profileReturnScene}">← Вернуться</button>`;
  if (state.identity === "guest") {
    return `
      ${backButton}
      ${state.profileMessage ? `<div class="notice info profile-message">${state.profileMessage}</div>` : ""}
      <section class="control-card hybrid-priority profile-hero">
        <div class="profile-avatar guest-avatar">ГЛ</div>
        <span class="chip">Гостевой профиль</span>
        <h1>Гость Лиловый Лис</h1>
        <p class="muted">Профиль работает только в этом браузере. Он сохраняет ваши активные выборы и историю, но завершится после 24 часов без подтверждённых действий.</p>
        <button class="button primary yandex-button" data-action="sign-in">Войти через Яндекс ID</button>
      </section>
      <section class="control-card">
        <p class="eyebrow">После входа</p>
        <h3>Текущие данные сохранятся</h3>
        <div class="benefit-list"><span>✓ Совместные выборы и ваши оценки</span><span>✓ История завершённых выборов</span><span>✓ Имя профиля и постоянный доступ</span></div>
        <div class="notice info">DINDER использует Яндекс ID только для входа. Адрес электронной почты не сохраняется.</div>
      </section>`;
  }
  return `
    ${backButton}
    ${state.profileMessage ? `<div class="notice info profile-message">${state.profileMessage}</div>` : ""}
    <section class="control-card hybrid-priority profile-hero">
      <div class="profile-avatar">АН</div>
      <span class="chip success-chip">Профиль подтверждён</span>
      <h1>Анна</h1>
      <p class="muted">Вы вошли через Яндекс ID. Другие участники видят только ваше имя и аватар.</p>
      <label class="field"><span>Имя в DINDER</span><input value="Анна" aria-label="Имя в DINDER" /></label>
      <button class="button secondary" data-action="save-profile">Сохранить имя</button>
    </section>
    <section class="control-card profile-actions">
      <div><p class="eyebrow">На этом устройстве</p><h3>Управление входом</h3><p class="helper">Выход не удаляет профиль и историю.</p></div>
      <button class="button secondary" data-action="request-logout">Выйти из профиля</button>
    </section>
    <section class="control-card danger-zone">
      <p class="eyebrow danger-text">Удаление профиля</p>
      <h3>Удалить данные и доступ</h3>
      <p class="helper">Это повлияет на активные совместные выборы. Перед удалением покажем все последствия.</p>
      <button class="button danger" data-action="request-delete-profile">Удалить профиль</button>
    </section>`;
}

function hybridMain(scene) {
  if (scene === "home") return `<section class="control-card hybrid-priority"><p class="eyebrow">Начать</p><h1>Куда пойдём?</h1><p class="muted">Создайте совместный выбор или присоединитесь по коду.</p>${commonHomeActions()}</section><section class="active-session-card"><div><span class="status-pill online">Активный выбор</span><h3>M7K-4QA · этап 1 из 2</h3><p>Вы вышли на главную, но остались участником.</p></div><button class="button primary" data-scene="returning">Вернуться</button></section>`;
  if (scene === "join") return `<section class="control-card hybrid-priority"><h2>Вход по коду</h2>${joinForm()}</section>`;
  if (scene === "group") return groupPanel();
  if (scene === "filters") return filtersPanel();
  if (scene === "settings") return settingsPanel();
  if (scene === "configuring") {
    if (state.role === "host") return `<section class="control-card hybrid-priority"><p class="eyebrow">Следующее действие</p><h2>Настройте совместный выбор</h2><p class="muted">Участники уже могут присоединяться. Начните с фильтров, затем задайте общие параметры.</p><div class="focus-action"><button class="button primary" data-scene="filters">Настроить фильтры</button><button class="button secondary" data-scene="group">Посмотреть группу</button></div></section>${hybridEvents()}`;
    return `<section class="control-card hybrid-priority"><p class="eyebrow">Ожидание старта</p><h2>Организатор настраивает выбор</h2><div class="organizer-callout"><span class="avatar host-avatar">ОР</span><span><strong>Анна — организатор</strong><small>Сейчас выбирает фильтры</small></span></div><div class="control-card-row">${avatars()}<strong>4 участника</strong></div><button class="button secondary" data-scene="group">Посмотреть группу</button><button class="button ghost" data-action="leave-to-home">Выйти на главную</button></section>${hybridEvents()}`;
  }
  if (scene === "loading") return `<section class="control-card hybrid-priority"><p class="eyebrow">Автоматический запуск</p><h2>Проверяем заведения</h2><div class="loading-orbit" aria-hidden="true">↻</div><div class="progress" style="--progress:78%"><span></span></div><p>Проверяем фотографии и доступность. После успешной проверки первый этап начнётся автоматически, а таймер запустится с 05:00.</p><div class="notice info">Дополнительное подтверждение организатора не потребуется.</div></section>${hybridEvents()}`;
  if (scene === "voting") return hybridVotingPanel();
  if (scene === "detail") return placeDetailsPanel();
  if (scene === "returning") return `<section class="control-card hybrid-priority"><p class="eyebrow">Активный совместный выбор</p><h2>Группа продолжает оценивать</h2><div class="organizer-callout"><span class="avatar host-avatar">ОР</span><span><strong>Анна — организатор</strong><small>4 участника · этап 1 из 2</small></span></div><div class="control-list"><div><span>Ваш прогресс</span><strong>3 из 10</strong></div></div><button class="button primary" data-scene="voting">Вернуться к оценкам</button><button class="button ghost" data-action="leave-to-home">Остаться на главной</button></section>`;
  if (scene === "expired") return hybridExpiredPanel();
  if (scene === "profile") return profilePanel();
  if (["offline", "match", "no-match", "history", "empty"].includes(scene)) return dashboardMain(scene);
  return dashboardMain(scene);
}

function renderHybrid() {
  return `<main class="hybrid-layout">${hybridHeader()}<div class="hybrid-content">${hybridMain(state.scene)}${domainStateDebug()}</div></main>`;
}

function scheduleRuntime() {
  clearTimeout(autoStartTimeout);
  clearInterval(countdownInterval);
  if (state.variant === "D" && state.scene === "loading") {
    autoStartTimeout = setTimeout(() => {
      toast("Проверка завершена — первый этап начался автоматически");
      setScene("voting");
    }, 2800);
  }
  if (["voting", "detail", "returning"].includes(state.scene)) {
    countdownInterval = setInterval(() => {
      state.timerSeconds = Math.max(0, state.timerSeconds - 1);
      document.querySelectorAll("[data-timer]").forEach((element) => {
        element.textContent = formatTimer(state.timerSeconds);
      });
    }, 1000);
  }
}

function render() {
  const renderer = state.variant === "A" ? renderFocus : state.variant === "B" ? renderControl : state.variant === "C" ? renderStory : renderHybrid;
  document.querySelector("#app").innerHTML = `<div class="prototype-shell">${toolbar()}${renderer()}</div>${variantSwitcher()}`;
  scheduleRuntime();
}

document.addEventListener("change", (event) => {
  if (event.target.matches("#scene-select")) setScene(event.target.value);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.scene) return setScene(button.dataset.scene);
  const action = button.dataset.action;
  if (action === "previous-variant") return cycleVariant(-1);
  if (action === "next-variant") return cycleVariant(1);
  if (action === "toggle-role") {
    state.role = state.role === "host" ? "participant" : "host";
    if (currentScene().hostOnly && state.role !== "host") state.scene = "group";
    syncUrl();
    render();
    return;
  }
  if (action === "join-session") {
    state.role = "participant";
    toast("Вы присоединились как участник");
    return setScene("configuring");
  }
  if (action === "copy-code") return toast("Код M7K-4QA скопирован (имитация)");
  if (action === "toggle-events") {
    state.eventsExpanded = !state.eventsExpanded;
    return render();
  }
  if (action === "toggle-chip") {
    const selected = button.classList.toggle("selected");
    button.setAttribute("aria-pressed", String(selected));
    return;
  }
  if (action === "select-duration") {
    button.closest(".segmented").querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    toast(`Длительность изменена: ${button.textContent}`);
    return;
  }
  if (action === "open-details") return setScene("detail");
  if (action === "previous-photo" || action === "next-photo") {
    const direction = action === "next-photo" ? 1 : -1;
    state.photoIndex = (state.photoIndex + direction + 3) % 3;
    return render();
  }
  if (action === "open-map") return toast("В приложении здесь откроется полноэкранная карта");
  if (action === "sign-in") {
    state.identity = "user";
    state.profileMessage = "Гостевой профиль преобразован в постоянный. История и активные выборы сохранены.";
    syncUrl();
    toast("Вы вошли через Яндекс ID (имитация)");
    return render();
  }
  if (action === "save-profile") return toast("Имя профиля сохранено (имитация)");
  if (action === "request-logout" || action === "request-delete-profile") {
    state.profileConfirmation = action === "request-logout" ? "logout" : "delete";
    state.profileMessage = null;
    return render();
  }
  if (action === "cancel-profile-action") {
    state.profileConfirmation = null;
    return render();
  }
  if (action === "confirm-logout") {
    state.identity = "guest";
    state.profileConfirmation = null;
    state.profileMessage = "Вы вышли. На этом устройстве создан новый гостевой профиль.";
    syncUrl();
    return render();
  }
  if (action === "confirm-delete-profile") {
    state.identity = "guest";
    state.profileConfirmation = null;
    state.profileMessage = "Профиль удалён. Историческая активность обезличена, создан новый гостевой профиль.";
    syncUrl();
    return render();
  }
  if (action === "leave-to-home") {
    toast("Вы вышли на главную и остались участником");
    return setScene("home");
  }
  if (action === "vote-yes" || action === "vote-no") {
    state.localVotes = Math.min(10, state.localVotes + 1);
    toast(action === "vote-yes" ? "Положительная оценка принята" : "Отрицательная оценка принята");
    return render();
  }
  if (action === "reconnect") {
    toast("Актуальное состояние загружено, последняя оценка подтверждена");
    return setScene("voting");
  }
  if (action === "extend") {
    toast("Этап продлён на полный интервал");
    return setScene("voting");
  }
});

let galleryTouchStart;
document.addEventListener("touchstart", (event) => {
  if (!event.target.closest("[data-gallery]")) return;
  galleryTouchStart = event.changedTouches[0].clientX;
}, {passive: true});

document.addEventListener("touchend", (event) => {
  if (galleryTouchStart === undefined || !event.target.closest("[data-gallery]")) return;
  const delta = event.changedTouches[0].clientX - galleryTouchStart;
  galleryTouchStart = undefined;
  if (Math.abs(delta) < 40) return;
  state.photoIndex = (state.photoIndex + (delta < 0 ? 1 : -1) + 3) % 3;
  render();
}, {passive: true});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target.matches("input, textarea, select, [contenteditable='true']")) return;
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(location.search);
  state.variant = normalizeVariant(params.get("variant"));
  state.scene = normalizeScene(params.get("scene"));
  state.role = params.get("role") === "participant" ? "participant" : "host";
  state.identity = params.get("identity") === "user" ? "user" : "guest";
  state.profileConfirmation = null;
  state.profileMessage = null;
  render();
});

syncUrl();
render();
