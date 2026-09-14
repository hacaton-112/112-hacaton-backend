import { Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  type CounterConfiguration,
  Gauge,
  type GaugeConfiguration,
  Histogram,
  type HistogramConfiguration,
  Registry,
} from "prom-client";

/** Общий префикс: метрики тренажёра не спутать с метриками соседних сервисов. */
export const METRIC_PREFIX = "system112_";

/**
 * Реестр метрик backend.
 *
 * Свой реестр, а не глобальный `register` из prom-client: тесты создают
 * приложение несколько раз, и глобальный реестр отказывался бы регистрировать
 * одноимённую метрику второй раз. Метрики процесса — память, процессор,
 * задержка цикла событий — собираются здесь же: голос идёт через тот же
 * процесс, и именно они показывают, выдержит ли он параллельные звонки.
 */
@Injectable()
export class MetricsRegistry {
  private readonly registry = new Registry();

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: METRIC_PREFIX });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  counter<T extends string>(
    configuration: Omit<CounterConfiguration<T>, "registers">,
  ): Counter<T> {
    return new Counter({ ...configuration, registers: [this.registry] });
  }

  gauge<T extends string>(
    configuration: Omit<GaugeConfiguration<T>, "registers">,
  ): Gauge<T> {
    return new Gauge({ ...configuration, registers: [this.registry] });
  }

  histogram<T extends string>(
    configuration: Omit<HistogramConfiguration<T>, "registers">,
  ): Histogram<T> {
    return new Histogram({ ...configuration, registers: [this.registry] });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
