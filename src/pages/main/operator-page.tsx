import { toast } from "@bolid-ui/themes";
import { useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneOff } from "lucide-react";
import { useEffect, useState } from "react";

import { QUERY_KEYS } from "../../config/query-keys";
import { CallerPanel } from "../../components/operator/caller-panel";
import { CallControlDock } from "../../components/operator/call-control-dock";
import { IncidentMapDialog } from "../../components/operator/incident-map-dialog";
import { IncidentForm } from "../../components/operator/incident-form";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import { useCall } from "../../hooks/use-call";
import { useOperatorPhoneWindow } from "../../hooks/use-operator-phone-window";
import { useIncidentCard } from "../../hooks/use-incident-card";
import { useIncidentPoint } from "../../hooks/use-incident-point";
import {
  getClassifierDispatchServices,
  getMissingIncidentCardFields,
  getMissingIncidentCardRequirements,
} from "../../lib/incident-card-readiness";
import { useAuthStore } from "../../stores/auth.store";

export default function OperatorPage() {
  const call = useCall();
  const operatorName =
    useAuthStore((state) => state.user?.fullName) ?? "Оператор";
  const [isEnding, setEnding] = useState(false);
  // Пока оператор не нажал «Отправить», карточка считается заполняемой, а не
  // ошибочной. Помним звонок, в котором была попытка: следующий начинается с
  // чистого листа без сброса в эффекте.
  const [attemptedSession, setAttemptedSession] = useState<string | null>(null);
  const incidentCard = useIncidentCard({
    trainingSessionId: call.trainingSessionId,
    isCallOver: call.state === "ended",
    locationDefaults: call.incident
      ? {
          addressText: call.incident.address,
          latitude: call.incident.latitude,
          longitude: call.incident.longitude,
        }
      : undefined,
  });
  const missingCardFields = getMissingIncidentCardFields(incidentCard.card);
  const missingCardRequirements = getMissingIncidentCardRequirements(
    incidentCard.card,
  ).map(({ field }) => field);
  const dispatchAttempted =
    attemptedSession !== null && attemptedSession === call.trainingSessionId;
  const classifierServices = getClassifierDispatchServices(
    incidentCard.card?.classifierRouting,
  );

  const handleEnd = async () => {
    setEnding(true);

    try {
      // Backend закрывает карточку вместе со звонком, поэтому debounce должен
      // завершиться раньше команды end.
      await incidentCard.flush();
      await call.end();
    } catch {
      // Оба hook уже показали пользователю предметную ошибку. Звонок остаётся
      // активным, чтобы оператор мог повторить сохранение и завершение.
    } finally {
      setEnding(false);
    }
  };

  const handleDispatch = async () => {
    // Незаполненные поля подсвечиваются только после попытки отправки: в
    // начале разговора карточка пуста по определению, и красные поля тогда
    // не подсказка, а помеха.
    setAttemptedSession(call.trainingSessionId ?? null);
    if (missingCardFields.length > 0) {
      toast.warning("Карточка ещё не готова к отправке", {
        id: "incident-card-not-ready",
        description: `Заполните: ${missingCardFields.join(", ")}.`,
        duration: 8_000,
      });
      return;
    }

    try {
      const receipt = await incidentCard.dispatch();
      toast.success("Карточка направлена в ДДС", {
        id: "incident-card-dispatched",
        description: `${receipt.deliveries
          .map(
            ({ addressedService }) => DISPATCH_SERVICE_LABELS[addressedService],
          )
          .join(", ")}. Первичный статус ожидается в течение 30 секунд.`,
      });
    } catch {
      // Предметная ошибка остаётся в состоянии карточки и показывается ниже.
    }
  };

  // Карточка остаётся открытой до конца разговора: заявитель называет
  // подъезд или пострадавшего уже после отправки в ДДС, и этим сведениям
  // нужно место. Сама доставка от правок не меняется — ДДС получает снимок,
  // сделанный в момент отправки.
  const isCardEditable =
    call.state === "active" &&
    Boolean(incidentCard.card) &&
    !isEnding &&
    !incidentCard.isDispatching &&
    !call.isRecovering;
  // Точку на карте оператор отмечает только в своём идущем звонке: backend
  // определяет адрес по той же учебной сессии и чужую не примет.
  const incidentPoint = useIncidentPoint(call.trainingSessionId);
  // Телефон живёт в отдельном окне, но звонок остаётся здесь: окну уходит
  // снимок разговора, а обратно приходят только нажатия трубки и микрофона.
  useOperatorPhoneWindow({
    ...call,
    onEnd: () => void handleEnd(),
  });

  useEffect(() => {
    if (!call.error) return;

    toast.error(call.isConnected ? "Ошибка звонка" : "Сервер недоступен", {
      id: "call-server-error",
      description: call.error,
      duration: 6_000,
    });
  }, [call.error, call.isConnected]);

  const queryClient = useQueryClient();

  // Закончившийся или отклонённый сервером звонок меняет счётчик попыток.
  useEffect(() => {
    if (call.state !== "ended" && !call.error) return;

    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.myAssignments(),
    });
  }, [call.state, call.error, queryClient]);

  useEffect(() => {
    if (!call.endedByInstructor) return;

    toast.warning("Занятие завершено преподавателем", {
      id: "call-ended-by-instructor",
      description: "Запись попытки сохранена. Можно перейти к разбору.",
      duration: 8_000,
    });
  }, [call.endedByInstructor]);

  useEffect(() => {
    if (!incidentCard.error) return;

    const title =
      incidentCard.errorOperation === "dispatch"
        ? "Карточка не отправлена в ДДС"
        : incidentCard.errorOperation === "load"
          ? "Карточка не загружена"
          : "Карточка не сохранена";
    toast.error(title, {
      id: "incident-card-error",
      description: incidentCard.error,
      duration: 6_000,
    });
  }, [incidentCard.error, incidentCard.errorOperation]);

  return (
    <div className="arm-operator-page relative flex h-full min-h-0 flex-col overflow-hidden">
      {call.isRecovering && (
        <div
          className="bg-amber-3 text-amber-12 absolute inset-x-0 top-0 z-[60] px-4 py-2 text-center text-sm font-medium shadow-sm"
          role="status"
        >
          Сбой сети. Восстановление активной сессии…{" "}
          {call.recoverySecondsRemaining} с
        </div>
      )}
      <OperatorTelephoneStrip
        callerNumber={call.callerNumber}
        elapsedSeconds={call.elapsedSeconds}
        operatorName={operatorName}
        sessionId={call.trainingSessionId}
        startedAt={call.startedAt}
        state={call.state}
      />
      {!call.voiceTransportAvailable && (
        <div className="arm112-browser-notice" role="status">
          В браузерной версии карточка доступна для проверки, но голосовой
          звонок ещё использует нативный транспорт Tauri. Для запуска звонка
          откройте desktop-версию.
        </div>
      )}
      {/* Карточка занимает экран целиком и не прокручивается страницей: в АРМ
          оператор не ищет поле колесом мыши, всё лежит на своих местах. */}
      <main className="arm112-workspace" aria-label="Карточка происшествия">
        <IncidentForm
          sessionId={call.trainingSessionId}
          card={incidentCard.card}
          // До приёма вызова заполнять нечего, после завершения карточку
          // закрывает backend: дописанное после разговора не оценивается.
          disabled={!isCardEditable}
          onChange={incidentCard.update}
          locationFill={incidentPoint.fill}
          locationAction={
            <IncidentMapDialog
              incident={call.incident}
              selectedPoint={incidentPoint.point}
              status={incidentPoint.status}
              required={
                dispatchAttempted && missingCardRequirements.includes("point")
              }
              onSelectPoint={isCardEditable ? incidentPoint.select : undefined}
            />
          }
          missingRequirements={
            call.state === "active" && dispatchAttempted
              ? missingCardRequirements
              : []
          }
          callerSlot={
            <div className="min-w-0" data-tour="caller">
              <CallerPanel
                trainingSessionId={call.trainingSessionId}
                callerNumber={call.callerNumber}
                startedAt={call.startedAt}
                operatorName={operatorName}
                card={incidentCard.card}
                disabled={!isCardEditable}
                onChange={incidentCard.update}
              />
            </div>
          }
        />
      </main>
      <CallControlDock
        {...call}
        missingCardFields={missingCardFields}
        services={incidentCard.services}
        classifierServices={classifierServices}
        onToggleService={incidentCard.toggleService}
        dispatchError={
          incidentCard.errorOperation === "dispatch"
            ? incidentCard.error
            : undefined
        }
        isCardSubmitted={Boolean(incidentCard.card?.submittedAt)}
        isDispatching={incidentCard.isDispatching}
        isEnding={isEnding}
        onDispatch={() => void handleDispatch()}
        onEnd={() => void handleEnd()}
      />
    </div>
  );
}

function OperatorTelephoneStrip({
  callerNumber,
  elapsedSeconds,
  operatorName,
  sessionId,
  startedAt,
  state,
}: {
  callerNumber?: string;
  elapsedSeconds: number;
  operatorName: string;
  sessionId?: string;
  startedAt?: Date;
  state: "idle" | "ringing" | "active" | "ended";
}) {
  const incidentNumber = sessionId?.slice(-8).toUpperCase() ?? "--------";
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");

  return (
    <header className="arm112-strip">
      <div className="arm112-hangup">
        <PhoneOff size={22} aria-hidden />
        <div>
          <strong>
            {state === "active"
              ? "Соединение"
              : state === "ringing"
                ? "Подключение"
                : "Отключение"}
          </strong>
          <span className="arm112-connection-kind">
            Учебный телефонный вызов
          </span>
        </div>
      </div>

      <TelephoneField label="АОН" value={callerNumber} primary />
      <TelephoneField label="предоставленный" />
      <TelephoneField label="телефон на место" />

      <div className="arm112-identity">
        <strong>Происшествие {incidentNumber}</strong>
        <span>
          {startedAt
            ? `Открыто ${startedAt.toLocaleString("ru-RU")}`
            : "Вызов не начат"}
        </span>
        <span>Опер. {operatorName}, АРМ учебный</span>
      </div>

      <div
        className="arm112-timer"
        data-overdue={elapsedSeconds >= 240 || undefined}
      >
        <strong>
          {minutes}:{seconds}
        </strong>
        <span>
          минут<i>секунд</i>
        </span>
      </div>
    </header>
  );
}

/** Номер в полосе АРМ: пустой показывается маской, как в реальной системе. */
function TelephoneField({
  label,
  value,
  primary = false,
}: {
  label: string;
  value?: string;
  primary?: boolean;
}) {
  return (
    <div className="arm112-phone" data-primary={primary || undefined}>
      <span className="arm112-phone-icon">
        <Phone size={17} aria-hidden />
      </span>
      <span className="arm112-phone-value">
        <span>{label}</span>
        <strong>{value ?? "+7 (   )   -   -"}</strong>
      </span>
      {!primary && <span className="arm112-phone-badge">АОН</span>}
    </div>
  );
}
