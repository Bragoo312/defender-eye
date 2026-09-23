import type { SecurityEvent, BlockInfo, IPInfo } from '../types';

/**
 * Возвращает понятное человеческое описание атаки на простом русском языке.
 */
export function getHumanEventDescription(ev: SecurityEvent): {
  category: string;
  summary: string;
  details: string;
  dangerBadge: string;
} {
  const monitor = (ev.monitor || '').toLowerCase();
  const eventType = (ev.event_type || '').toLowerCase();
  const msg = ev.message || '';

  // 1. SSH Brute Force
  if (monitor.includes('ssh') || eventType.includes('ssh')) {
    const userMatch = msg.match(/user ['"]?([^'" ]+)['"]?/i) || ev.username;
    const user = typeof userMatch === 'string' ? userMatch : userMatch ? userMatch[1] : '';
    const userText = user ? `под логином «${user}»` : 'к системной консоли';
    const isRoot = user === 'root';

    return {
      category: 'Подбор пароля к серверу (SSH)',
      summary: `Бот пытался угадать пароль ${userText}`,
      details: isRoot
        ? 'Критическая опасность: злоумышленник пытается получить полный доступ суперпользователя (root) к управлению вашим сервером через SSH порт 22.'
        : `Попытка несанкционированного входа через защищенный порт SSH (22). Система зафиксировала множественные неудачные попытки ввода пароля.`,
      dangerBadge: isRoot ? 'Опасно: цель root' : 'Подбор пароля',
    };
  }

  // 2. Web Reconnaissance (сканирование сайта)
  if (monitor.includes('web_recon') || eventType.includes('web_recon')) {
    let target = 'скрытые файлы и панели';
    if (msg.includes('/wp-login') || msg.includes('wordpress')) target = 'вход в админку WordPress (/wp-login.php)';
    else if (msg.includes('.env')) target = 'секретные файлы конфигурации и пароли (.env)';
    else if (msg.includes('/admin')) target = 'панель управления сервером (/admin)';
    else if (msg.includes('phpmyadmin')) target = 'управление базой данных phpMyAdmin';

    return {
      category: 'Поиск уязвимостей сайта (Web Recon)',
      summary: `Сканер прощупывал ${target}`,
      details: 'Автоматический скрипт зондирует веб-сервер на наличие известных уязвимостей, забытых файлов с паролями или открытых административных панелей.',
      dangerBadge: 'Поиск уязвимостей',
    };
  }

  // 3. Web Brute Force
  if (monitor.includes('web_brute') || eventType.includes('web_brute')) {
    return {
      category: 'Подбор пароля на сайте (Web Brute)',
      summary: 'Множественные попытки входа в веб-панель или аккаунт',
      details: 'Хакерский скрипт отправляет серию POST-запросов, перебирая логины и пароли в форму авторизации сайта.',
      dangerBadge: 'Перебор веб-паролей',
    };
  }

  // 4. Database Brute Force
  if (monitor.includes('database') || monitor.includes('db_brute') || eventType.includes('db_brute')) {
    const isPg = msg.toLowerCase().includes('postgres');
    const dbName = isPg ? 'PostgreSQL (порт 5432)' : 'MySQL/MariaDB (порт 3306)';

    return {
      category: 'Попытка взлома базы данных',
      summary: `Злоумышленник пытался удаленно подключиться к ${dbName}`,
      details: 'Прямая попытка подбора паролей к сетевому порту СУБД. Рекомендуется закрыть порт базы от прямого доступа из интернета.',
      dangerBadge: 'Взлом базы данных',
    };
  }

  // 5. Port Scan / Reconnaissance
  if (monitor.includes('port_scan') || monitor.includes('antirecon') || eventType.includes('port_scan')) {
    return {
      category: 'Скрытая разведка портов (Port Scan)',
      summary: 'Сканер проверял, какие службы и порты открыты на сервере',
      details: 'С помощью SYN-пакетов атакующий ищет доступные службы (SSH, базы данных, прокси, почту), чтобы найти слабое звено для атаки.',
      dangerBadge: 'Сетевая разведка',
    };
  }

  // 6. IP Ban (Блокировка брандмауэром)
  if (monitor.includes('ban') || eventType.includes('ban') || ev.action === 'blocked') {
    return {
      category: 'Автоматический бан брандмауэра',
      summary: 'IP-адрес заблокирован на уровне ядра Linux (iptables / nftables)',
      details: 'Лимит допустимых ошибок исчерпан. Все сетевые пакеты с этого адреса теперь автоматически отбрасываются брандмауэром.',
      dangerBadge: 'Заблокирован в брандмауэре',
    };
  }

  // 7. Resource Overload / DoS
  if (monitor.includes('overload') || eventType.includes('overload')) {
    return {
      category: 'Аномальный всплеск трафика (DoS)',
      summary: 'Подозрительно высокая нагрузка от одного источника',
      details: 'Зафиксирован резкий всплеск сетевых запросов, который мог вызвать перегрузку процессора или оперативной памяти.',
      dangerBadge: 'Подозрение на DoS',
    };
  }

  // Generic fallback
  return {
    category: 'Инцидент безопасности',
    summary: ev.message || 'Зафиксирована подозрительная сетевая активность',
    details: 'Сетевой фильтр перехватил нестандартный запрос и занес его в журнал для аудита.',
    dangerBadge: 'Алерт безопасности',
  };
}

/**
 * Возвращает понятную причину бана для неспециалистов.
 */
export function getHumanBanReason(ban: BlockInfo): { title: string; subtitle: string } {
  const reason = (ban.reason || ban.monitor || '').toLowerCase();

  if (reason.includes('ssh')) {
    return {
      title: 'Превышен лимит попыток подбора SSH паролей',
      subtitle: 'Более 5 неудачных попыток входа за короткое время',
    };
  }
  if (reason.includes('port') || reason.includes('recon')) {
    return {
      title: 'Агрессивное сканирование закрытых сетевых портов',
      subtitle: 'Зондирование периметра хоста с поиском уязвимых служб',
    };
  }
  if (reason.includes('web')) {
    return {
      title: 'Вредоносное сканирование админок сайта и подбор паролей',
      subtitle: 'Поиск скрытых панелей и перебор учетных записей веб-сервера',
    };
  }
  if (reason.includes('db') || reason.includes('database')) {
    return {
      title: 'Попытка несанкционированного подключения к базе данных',
      subtitle: 'Перебор паролей к порту PostgreSQL или MySQL',
    };
  }

  return {
    title: 'Нарушение правил безопасности периметра',
    subtitle: ban.reason || 'Заблокирован автоматической политикой защиты',
  };
}

/**
 * Формирует человеко-читаемое досье и вердикт по атакующему IP-адресу.
 */
export function getHumanIPVerdict(
  ipInfo: IPInfo | null | undefined,
  events: SecurityEvent[]
): {
  verdictTitle: string;
  verdictColor: string;
  verdictDesc: string;
  threatLevel: string;
  recommendation: string;
  primaryVector: string;
} {
  const total = ipInfo?.total_events || events.length;
  const isBanned = ipInfo?.is_banned || events.some((e) => e.action === 'blocked');

  // Count attack vectors
  let sshCount = 0;
  let webCount = 0;
  let portCount = 0;
  let dbCount = 0;

  events.forEach((e) => {
    const m = (e.monitor || e.event_type || '').toLowerCase();
    if (m.includes('ssh')) sshCount++;
    else if (m.includes('web')) webCount++;
    else if (m.includes('port') || m.includes('recon')) portCount++;
    else if (m.includes('db') || m.includes('database')) dbCount++;
  });

  let primaryVector = 'Сетевая разведка';
  if (sshCount >= webCount && sshCount >= portCount && sshCount >= dbCount && sshCount > 0) {
    primaryVector = `Подбор паролей SSH (${sshCount} попыток)`;
  } else if (webCount >= portCount && webCount > 0) {
    primaryVector = `Сканирование веб-сайта (${webCount} запросов)`;
  } else if (portCount > 0) {
    primaryVector = `Сканирование сетевых портов (${portCount} проверок)`;
  } else if (dbCount > 0) {
    primaryVector = `Взлом базы данных (${dbCount} попыток)`;
  }

  const org = ipInfo?.as_org || 'Неизвестный провайдер';
  const country = ipInfo?.country_name || 'Неизвестная страна';

  if (isBanned || total >= 10) {
    return {
      verdictTitle: 'Вредоносный ботнет / Сканер уязвимостей',
      verdictColor: 'text-rose-400 bg-rose-950/70 border-rose-800',
      threatLevel: 'Критическая',
      verdictDesc: `С этого адреса (${org}, ${country}) зафиксировано ${total} агрессивных инцидентов. Основное направление: ${primaryVector}. Бот целенаправленно ищет слабые места в защите сервера.`,
      recommendation: 'Держать в постоянной блокировке. Не удалять из правил брандмауэра.',
      primaryVector,
    };
  }

  if (total >= 3) {
    return {
      verdictTitle: 'Подозрительный разведчик',
      verdictColor: 'text-amber-400 bg-amber-950/70 border-amber-800',
      threatLevel: 'Высокая',
      verdictDesc: `Адрес из ${country} (${org}) проводит предварительную разведку сервера. Зафиксировано ${total} обращений: ${primaryVector}.`,
      recommendation: 'Находится под усиленным наблюдением системы. При повторении будет автоматически отправлен в бан.',
      primaryVector,
    };
  }

  return {
    verdictTitle: 'Случайное сканирование',
    verdictColor: 'text-cyan-400 bg-cyan-950/70 border-cyan-800',
    threatLevel: 'Умеренная',
    verdictDesc: `Единичная сетевая активность из ${country} (${org}). Вероятно, адрес попал в список массового автоматического обзвона интернета.`,
    recommendation: 'Особых действий не требуется, сервер автоматически защищен.',
    primaryVector,
  };
}
