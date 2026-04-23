/**
 * CloudWatch Embedded Metric Format (EMF) utility.
 *
 * Emits structured JSON that CloudWatch automatically extracts as custom
 * metrics under the PRNotify namespace. No SDK or API calls needed --
 * console.log with the right JSON format is all it takes.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */

type MetricUnit = 'Count' | 'Milliseconds' | 'None'

interface MetricDefinition {
  Name: string
  Unit: MetricUnit
}

/**
 * Emits a single CloudWatch EMF metric.
 */
export function emitMetric(params: {
  metricName: string
  value: number
  unit: MetricUnit
  dimensions?: Record<string, string>
}): void {
  const dimensions = params.dimensions ?? {}
  const dimensionKeys = Object.keys(dimensions)

  const metric: MetricDefinition = {
    Name: params.metricName,
    Unit: params.unit,
  }

  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: 'PRNotify',
          Dimensions: dimensionKeys.length > 0 ? [dimensionKeys] : [[]],
          Metrics: [metric],
        },
      ],
    },
    ...dimensions,
    [params.metricName]: params.value,
  }

  console.log(JSON.stringify(payload))
}

/**
 * Emits multiple related metrics in a single EMF log entry.
 * Use when metrics share the same dimensions (e.g., queued + skipped from one webhook).
 */
export function emitMetrics(params: {
  metrics: Array<{ name: string; value: number; unit: MetricUnit }>
  dimensions?: Record<string, string>
}): void {
  const dimensions = params.dimensions ?? {}
  const dimensionKeys = Object.keys(dimensions)

  const metricDefinitions: MetricDefinition[] = params.metrics.map((m) => ({
    Name: m.name,
    Unit: m.unit,
  }))

  const metricValues: Record<string, number> = {}
  for (const m of params.metrics) {
    metricValues[m.name] = m.value
  }

  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: 'PRNotify',
          Dimensions: dimensionKeys.length > 0 ? [dimensionKeys] : [[]],
          Metrics: metricDefinitions,
        },
      ],
    },
    ...dimensions,
    ...metricValues,
  }

  console.log(JSON.stringify(payload))
}
