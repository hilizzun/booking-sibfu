// Контракт API сервиса самостоятельной записи на созвоны и встречи.
// Это первый исполняемый артефакт проекта: сначала контракт, потом код.
// Из этого файла компилятор TypeSpec собирает contract/openapi.yaml.
//
// Порядок Design First описан в AGENTS.md, раздел 6.
// Править openapi.yaml руками нельзя: он собирается из main.tsp.
//
// Сценарии С1 до С17 и границы объёма: docs/pdr/0001-bronirovanie.md (ревизия 4).
// Соответствие «операция ↔ сценарий» лежит в комментариях к операциям.

import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

/** Сервис бронирования слотов на созвоны и встречи. */
@service(#{ title: "Сервис бронирования" })
@info(#{ version: "1.0.0" })
namespace BookingService;

// ---------------------------------------------------------------------------
// Ошибки
// ---------------------------------------------------------------------------

/** Машиночитаемый код ошибки. Клиент опирается на код, человек читает message. */
union ErrorCode {
  /** Данные запроса не прошли проверку: исправьте и повторите. */
  validation_failed: "validation_failed",

  /** Требуется вход в кабинет, либо логин и пароль неверны. */
  unauthorized: "unauthorized",

  /** Объект с таким идентификатором, кодом или временем не найден. */
  not_found: "not_found",

  /** Слот занят, не входит в сетку или его время уже прошло. */
  slot_unavailable: "slot_unavailable",

  /** Запись уже отменена, отменять больше нечего. */
  already_cancelled: "already_cancelled",

  /** На тип встречи есть записи, удалить его нельзя. */
  meeting_type_in_use: "meeting_type_in_use",
}

/** Общее тело ответа при любой ошибке сервиса. */
model ErrorBody {
  /** Код ошибки для кода клиента. */
  code: ErrorCode;

  /** Сообщение на русском языке для показа пользователю. */
  message: string;
}

/** Запрос не прошёл проверку данных. */
@error
model ValidationError {
  @statusCode statusCode: 400;
  ...ErrorBody;
}

/** Нет входа в кабинет или неверные логин и пароль. */
@error
model UnauthorizedError {
  @statusCode statusCode: 401;
  ...ErrorBody;
}

/** Запрошенный объект не найден. */
@error
model NotFoundError {
  @statusCode statusCode: 404;
  ...ErrorBody;
}

/** Действие противоречит текущему состоянию данных. */
@error
model ConflictError {
  @statusCode statusCode: 409;
  ...ErrorBody;
}

// ---------------------------------------------------------------------------
// Часы приёма
// ---------------------------------------------------------------------------

/** День недели в часах приёма. */
union DayOfWeek {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
}

/** Часы приёма: повторяющееся правило, из которого слоты считаются на лету. */
model Schedule {
  /** Дни недели приёма в поясе time_zone. */
  @minItems(1)
  @maxItems(7)
  days_of_week: DayOfWeek[];

  /** Начало рабочего окна, местное время time_zone. Должно быть раньше end. */
  start: plainTime;

  /** Конец рабочего окна, местное время time_zone. */
  end: plainTime;

  /** Шаг сетки в минутах: расстояние между началами соседних слотов. */
  @minValue(1)
  @maxValue(720)
  step_minutes: int32;

  /** Пояс окна в формате IANA, например Europe/Moscow. */
  @pattern("^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+){1,2}$")
  time_zone: string;
}

// ---------------------------------------------------------------------------
// Тип встречи
// ---------------------------------------------------------------------------

/** Тип встречи: то, на что записывается гость, со своими часами приёма. */
model MeetingType {
  /** Идентификатор типа встречи. */
  id: int32;

  /** Название, например «Консультация». */
  @minLength(1)
  @maxLength(100)
  name: string;

  /** Длительность одной встречи в минутах. */
  @minValue(5)
  @maxValue(1440)
  duration_minutes: int32;

  /** Описание для гостя. */
  @maxLength(500)
  description: string;

  /** Часы приёма. Если не заданы, слоты не строятся и гость видит пустую сетку (С10). */
  schedule?: Schedule;
}

/** Данные для создания типа встречи. */
model MeetingTypeCreate {
  @minLength(1)
  @maxLength(100)
  name: string;

  @minValue(5)
  @maxValue(1440)
  duration_minutes: int32;

  @maxLength(500)
  description?: string = "";

  /** Часы приёма можно задать сразу или позже отдельной правкой (С7). */
  schedule?: Schedule;
}

/** Правка типа встречи: меняются только переданные поля. Существующие записи правка не трогает. */
model MeetingTypeUpdate {
  @minLength(1)
  @maxLength(100)
  name?: string;

  @minValue(5)
  @maxValue(1440)
  duration_minutes?: int32;

  @maxLength(500)
  description?: string;

  /** Новые часы приёма перекрывают прежние целиком и действуют на будущую сетку. */
  schedule?: Schedule;
}

// ---------------------------------------------------------------------------
// Слот
// ---------------------------------------------------------------------------

/** Слот сетки: начало плюс длительность типа встречи. Строится на лету, не хранится (ADR-0001). */
model Slot {
  /** Начало слота в UTC. Перевод в пояс зрителя делается на клиенте (С5, С15). */
  start: utcDateTime;

  /** Конец слота в UTC: start плюс длительность типа встречи. */
  end: utcDateTime;

  /** Не занят ли слот действующей записью. На прошедшее время запись закрыта независимо от флага. */
  is_free: boolean;
}

// ---------------------------------------------------------------------------
// Запись
// ---------------------------------------------------------------------------

/** Состояние записи. */
union BookingStatus {
  /** Запись действует и занимает своё время. */
  active: "active",

  /** Запись отменена, время снова доступно. */
  cancelled: "cancelled",
}

/** Запись гостя на встречу. */
model Booking {
  /** Идентификатор записи, виден организатору. */
  id: int32;

  /** Тип встречи. */
  meeting_type_id: int32;

  /** Название типа встречи на момент запроса, чтобы клиенту хватило одного запроса. */
  meeting_type_name: string;

  /** Начало встречи в UTC. */
  start: utcDateTime;

  /** Конец встречи в UTC. */
  end: utcDateTime;

  /** Пояс организатора в момент записи, IANA: показывается рядом с поясом гостя (С5). */
  time_zone: string;

  /** Имя гостя. */
  @minLength(1)
  @maxLength(100)
  guest_name: string;

  /** Почта гостя: контакт для организатора, доступ по ней не выдаётся. */
  @format("email")
  guest_email: string;

  /** Состояние записи. */
  status: BookingStatus;

  /** Момент создания записи в UTC. */
  created_at: utcDateTime;
}

/** Данные для создания записи. */
model BookingCreate {
  meeting_type_id: int32;

  /** Начало слота в UTC: должен совпадать со слотом сетки и быть в будущем (С12). */
  start: utcDateTime;

  @minLength(1)
  @maxLength(100)
  guest_name: string;

  @format("email")
  guest_email: string;
}

/** Подтверждение записи: выдаётся гостю сразу на экране (С1). */
model BookingConfirmation {
  /** Сама запись. */
  booking: Booking;

  /** Случайный код доступа к встрече и её отмене. Срок не истекает (С4). */
  @pattern("^[A-Za-z0-9_-]{22}$")
  access_code: string;

  /** Адрес файла календаря .ics по этому коду. */
  calendar_url: string;
}

// ---------------------------------------------------------------------------
// Вход в кабинет
// ---------------------------------------------------------------------------

/** Данные входа организатора в кабинет. */
model LoginRequest {
  @minLength(1)
  login: string;

  @minLength(1)
  password: string;
}

/** Сессия кабинета: httpOnly-кука session, выдаётся при входе и гасится при выходе (Q2). */
alias SessionCookie = ApiKeyAuth<ApiKeyLocation.cookie, "session">;

// ---------------------------------------------------------------------------
// Операции гостя
// ---------------------------------------------------------------------------

@tag("meeting-types")
namespace MeetingTypes {
  /** Типы встреч для записи: название, длительность, пояс и часы приёма (С7, С10). */
  @route("/meeting-types")
  @get
  op list(): MeetingType[];
}

@tag("slots")
namespace Slots {
  /**
   * Слоты типа встречи на диапазон дат: свободные и занятые (С1).
   * Даты задаются календарными днями в поясе организатора; ширина диапазона
   * не больше 31 дня, иначе отказ (С13). Если у типа нет часов приёма,
   * возвращается пустой список, а не ошибка (С10). Нет такого типа — 404 (С16).
   */
  @route("/slots")
  @get
  op list(
    /** Идентификатор типа встречи. */
    @query meeting_type_id: int32,
    /** Начало диапазона, включительно. */
    @query date_from: plainDate,
    /** Конец диапазона, включительно. */
    @query date_to: plainDate,
  ): Slot[] | NotFoundError | ValidationError;
}

@tag("bookings")
@route("/bookings")
namespace Bookings {
  /**
   * Запись гостя на свободный слот (С1). Возвращает подтверждение с кодом
   * доступа и адресом файла календаря. Слот занят, не входит в сетку или его
   * время уже прошло — 409 slot_unavailable (С2, С12); нет такого типа — 404;
   * неверные имя или почта — 400 (С11).
   */
  @post
  op create(@body body: BookingCreate): {
    @statusCode statusCode: 201;
    @body confirmation: BookingConfirmation;
  } | NotFoundError | ConflictError | ValidationError;

  /** Своя встреча по ссылке-коду: детали и состояние (С4). Чужой код не открывает встречу. */
  @get
  op get(@path code: string): Booking | NotFoundError;

  /**
   * Отмена встречи по ссылке-коду (С3). Повторная отмена — 409 already_cancelled.
   * Отмена не зависит от текущего времени: встречу в прошлом тоже можно отменить.
   */
  @route("/{code}/cancel")
  @post
  op cancel(@path code: string): Booking | NotFoundError | ConflictError;

  /** Файл календаря .ics: время указано и в поясе гостя, и в поясе организатора (С5). */
  @route("/{code}/calendar.ics")
  @get
  op calendar(@path code: string): {
    @statusCode statusCode: 200;
    @header contentType: "text/calendar";
    @body data: bytes;
  } | NotFoundError;
}

// ---------------------------------------------------------------------------
// Операции организатора: кабинет
// ---------------------------------------------------------------------------

/** Личный кабинет организатора. Все операции, кроме входа, требуют сессию (С6). */
@route("/admin")
namespace Admin {
  @tag("admin-auth")
  namespace Auth {
    /**
     * Вход в кабинет: задаёт httpOnly-куку session (С6). Неверные логин или
     * пароль — 401 unauthorized. Восстановление пароля не предусмотрено.
     */
    @route("/login")
    @post
    op login(@body body: LoginRequest): {
      @statusCode statusCode: 200;
      @header("set-cookie") setCookie: string;
    } | UnauthorizedError | ValidationError;

    /** Выход из кабинета: сессионная кука гасится. */
    @route("/logout")
    @post
    @useAuth(SessionCookie)
    op logout(): {
      @statusCode statusCode: 204;
      @header("set-cookie") setCookie: string;
    } | UnauthorizedError;
  }

  @tag("admin-meeting-types")
  @route("/meeting-types")
  namespace MeetingTypes {
    /** Типы встреч и часы приёма организатора, в его поясе (С7). */
    @get
    @useAuth(SessionCookie)
    op list(): MeetingType[] | UnauthorizedError;

    /** Создать тип встречи: длительность сразу, часы приёма сразу или позже (С7). */
    @post
    @useAuth(SessionCookie)
    op create(@body body: MeetingTypeCreate): {
      @statusCode statusCode: 201;
      @body meetingType: MeetingType;
    } | UnauthorizedError | ValidationError;

    /** Правка названия, описания, длительности или часов приёма. Существующие записи не меняются (Q12). */
    @route("/{id}")
    @patch
    @useAuth(SessionCookie)
    op update(
      @path id: int32,
      @body body: MeetingTypeUpdate,
    ): MeetingType | UnauthorizedError | NotFoundError | ValidationError;

    /**
     * Удалить тип встречи. Если на тип есть записи — 409 meeting_type_in_use:
     * записи не удаляются, тип остаётся для их смысла (Q12).
     */
    @route("/{id}")
    @delete
    @useAuth(SessionCookie)
    op delete(@path id: int32): {
      @statusCode statusCode: 204;
    } | UnauthorizedError | NotFoundError | ConflictError;
  }

  @tag("admin-bookings")
  @route("/bookings")
  namespace Bookings {
    /** Список записей: имя и почта гостя, тип встречи, время и состояние (С8). Новые сверху. */
    @get
    @useAuth(SessionCookie)
    op list(@query status?: BookingStatus): Booking[] | UnauthorizedError;

    /** Отмена записи организатором (С8). Слот освобождается, повторная отмена — 409 (С3). */
    @route("/{id}/cancel")
    @post
    @useAuth(SessionCookie)
    op cancel(@path id: int32): Booking | UnauthorizedError | NotFoundError | ConflictError;
  }
}



