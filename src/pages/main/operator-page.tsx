import { ScrollArea, Text, toast } from "@bolid-ui/themes";
import { useQueryClient } from "@tanstack/react-query";
import { CircleHelp, MapPin, MessageSquare, Phone } from "lucide-react";
import { useEffect, useState } from "react";

import { QUERY_KEYS } from "../../config/query-keys";
import { CallerPanel } from "../../components/operator/caller-panel";
import { CallControlDock } from "../../components/operator/call-control-dock";
import { DispatchCallPanel } from "../../components/operator/dispatch-call-panel";
import { IncidentForm } from "../../components/operator/incident-form";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import { useCall } from "../../hooks/use-call";
import { useIncidentCard } from "../../hooks/use-incident-card";
import { useIncidentPoint } from "../../hooks/use-incident-point";
import {
  getClassifierDispatchServices,
  getMissingIncidentCardFields,
} from "../../lib/incident-card-readiness";
import { useAuthStore } from "../../stores/auth.store";

export default function OperatorPage() {
  const call = useCall();
  const operatorName =
    useAuthStore((state) => state.user?.fullName) ?? "Оператор";
  const [isEnding, setEnding] = useState(false);
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

  const callerName = (() => {
    if (incidentCard.card?.callerAnonymous) return "Анонимный заявитель";

    const fullName = [
      incidentCard.card?.callerLastName,
      incidentCard.card?.callerFirstName,
      incidentCard.card?.callerMiddleName,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      fullName ||
      incidentCard.card?.callerPhone ||
      call.callerNumber ||
      "Заявитель"
    );
  })();
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
        state={call.state}
      />
      <ScrollArea
        className="operator-page-scroll min-h-0 flex-1 pb-24"
        scrollbars="vertical"
        type="auto"
      >
        <div className="operator-workspace grid min-h-full min-w-0 gap-2 p-2">
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
          <main
            className="operator-incident-column min-w-0"
            aria-label="Карточка происшествия"
          >
            <IncidentForm
              sessionId={call.trainingSessionId}
              card={incidentCard.card}
              // До приёма вызова заполнять нечего, после завершения карточку
              // закрывает backend: дописанное после разговора не оценивается.
              disabled={!isCardEditable}
              onChange={incidentCard.update}
              locationFill={incidentPoint.fill}
            />
          </main>
          <DispatchCallPanel
            {...call}
            selectedPoint={incidentPoint.point}
            pointStatus={incidentPoint.status}
            onSelectPoint={isCardEditable ? incidentPoint.select : undefined}
            services={incidentCard.services}
            requiredServices={
              incidentCard.card?.classifierRouting?.requiredServices ?? []
            }
            classifierServices={classifierServices}
            onToggleService={incidentCard.toggleService}
            callerName={callerName}
            isCardReady={isCardEditable}
            isEnding={isEnding}
          />
        </div>
      </ScrollArea>
      <CallControlDock
        {...call}
        missingCardFields={missingCardFields}
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
  state,
}: {
  callerNumber?: string;
  elapsedSeconds: number;
  operatorName: string;
  sessionId?: string;
  state: "idle" | "ringing" | "active" | "ended";
}) {
  const incidentNumber = sessionId?.slice(-8).toUpperCase() ?? "--------";
  const duration = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <header className="arm-telephone-strip">
      <div className="arm-phone-state">
        <Phone size={22} aria-hidden />
        <span>
          {state === "active"
            ? "Соединение"
            : state === "ringing"
              ? "Подключение"
              : "Отключение"}
        </span>
      </div>
      <TelephoneField
        icon={<Phone size={17} />}
        label="АОН"
        value={callerNumber ?? "+7 (   )  --- -- --"}
      />
      <TelephoneField
        icon={<MessageSquare size={17} />}
        label="предоставленный"
        value="+7 (   )  --- -- --"
      />
      <TelephoneField
        icon={<MapPin size={17} />}
        label="телефон на месте"
        value="+7 (   )  --- -- --"
      />
      <div className="arm-incident-identity">
        <strong>Происшествие {incidentNumber}</strong>
        <span>{operatorName} · АРМ учебный</span>
      </div>
      <div
        className="arm-incident-timer"
        data-overdue={elapsedSeconds >= 240 || undefined}
      >
        <strong>{duration}</strong>
        <span>МИНУТ · СЕКУНД</span>
      </div>
    </header>
  );
}

function TelephoneField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="arm-telephone-field">
      <span className="arm-telephone-icon">{icon}</span>
      <span className="arm-telephone-value">
        <Text as="span" size="1">
          {label}
        </Text>
        <strong>{value}</strong>
      </span>
      <CircleHelp size={14} aria-hidden />
    </div>
  );
}
