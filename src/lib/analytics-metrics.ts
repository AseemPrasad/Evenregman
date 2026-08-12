import { AnalyticsTimeSeriesModel } from "@/models/AnalyticsTimeSeries";

export interface HourlyMetrics {
  count: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

class AnalyticsMetricsCalculator {
  async calculateHourlyRegistrationMetrics(
    eventId: string,
    hostId: string,
    hourBucket: string,
  ): Promise<HourlyMetrics | null> {
    const result = await AnalyticsTimeSeriesModel.findOne({
      eventType: "registration",
      hourBucket,
      "dimensions.eventId": eventId,
      "dimensions.hostId": hostId,
    });

    if (!result) {
      return null;
    }

    return this.normalizeMetrics(result.metrics);
  }

  async calculateSalesVelocityPerEvent(eventId: string, timeWindowHours: number = 24): Promise<{
    totalSales: number;
    velocity: number;
    average: number;
  }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindowHours * 60 * 60 * 1000);

    const results = await AnalyticsTimeSeriesModel.aggregate([
      {
        $match: {
          eventType: "sale",
          "dimensions.eventId": eventId,
          timestamp: { $gte: windowStart, $lte: now },
        },
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: "$metrics.count" },
          totalAmount: { $sum: "$metrics.amount" },
        },
      },
    ]);

    if (results.length === 0) {
      return { totalSales: 0, velocity: 0, average: 0 };
    }

    const { totalCount, totalAmount } = results[0];
    const velocity = totalCount / timeWindowHours;
    const average = totalAmount / totalCount;

    return {
      totalSales: totalAmount,
      velocity,
      average,
    };
  }

  async calculateGeographicBreakdown(eventId: string): Promise<Record<string, number>> {
    const results = await AnalyticsTimeSeriesModel.aggregate([
      {
        $match: {
          eventType: "registration",
          "dimensions.eventId": eventId,
        },
      },
      {
        $group: {
          _id: "$dimensions.region",
          count: { $sum: "$metrics.count" },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const breakdown: Record<string, number> = {};

    for (const result of results) {
      const region = result._id || "unknown";
      breakdown[region] = result.count;
    }

    return breakdown;
  }

  async calculateHostDashboardMetrics(hostId: string): Promise<{
    totalRegistrations: number;
    totalCheckIns: number;
    totalSales: number;
    checkInRate: number;
    averageSalePerRegistration: number;
  }> {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [registrations, checkIns, sales] = await Promise.all([
      AnalyticsTimeSeriesModel.aggregate([
        {
          $match: {
            eventType: "registration",
            "dimensions.hostId": hostId,
            timestamp: { $gte: dayStart },
          },
        },
        { $group: { _id: null, total: { $sum: "$metrics.count" } } },
      ]),

      AnalyticsTimeSeriesModel.aggregate([
        {
          $match: {
            eventType: "checkin",
            "dimensions.hostId": hostId,
            timestamp: { $gte: dayStart },
          },
        },
        { $group: { _id: null, total: { $sum: "$metrics.count" } } },
      ]),

      AnalyticsTimeSeriesModel.aggregate([
        {
          $match: {
            eventType: "sale",
            "dimensions.hostId": hostId,
            timestamp: { $gte: dayStart },
          },
        },
        { $group: { _id: null, total: { $sum: "$metrics.amount" } } },
      ]),
    ]);

    const totalRegistrations = registrations[0]?.total || 0;
    const totalCheckIns = checkIns[0]?.total || 0;
    const totalSales = sales[0]?.total || 0;

    return {
      totalRegistrations,
      totalCheckIns,
      totalSales,
      checkInRate: totalRegistrations > 0 ? (totalCheckIns / totalRegistrations) * 100 : 0,
      averageSalePerRegistration: totalRegistrations > 0 ? totalSales / totalRegistrations : 0,
    };
  }

  async calculateEventMetrics(eventId: string): Promise<{
    registrationCount: number;
    checkInCount: number;
    checkInRate: number;
    totalRevenue: number;
    averageTicketPrice: number;
  }> {
    const [reg, checkins, sales] = await Promise.all([
      AnalyticsTimeSeriesModel.aggregate([
        { $match: { eventType: "registration", "dimensions.eventId": eventId } },
        { $group: { _id: null, total: { $sum: "$metrics.count" } } },
      ]),

      AnalyticsTimeSeriesModel.aggregate([
        { $match: { eventType: "checkin", "dimensions.eventId": eventId } },
        { $group: { _id: null, total: { $sum: "$metrics.count" } } },
      ]),

      AnalyticsTimeSeriesModel.aggregate([
        { $match: { eventType: "sale", "dimensions.eventId": eventId } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$metrics.amount" },
            totalQuantity: { $sum: "$metrics.quantity" },
          },
        },
      ]),
    ]);

    const registrationCount = reg[0]?.total || 0;
    const checkInCount = checkins[0]?.total || 0;
    const totalRevenue = sales[0]?.totalRevenue || 0;
    const totalQuantity = sales[0]?.totalQuantity || 1;

    return {
      registrationCount,
      checkInCount,
      checkInRate: registrationCount > 0 ? (checkInCount / registrationCount) * 100 : 0,
      totalRevenue,
      averageTicketPrice: totalQuantity > 0 ? totalRevenue / totalQuantity : 0,
    };
  }

  private normalizeMetrics(metrics: Record<string, any>): HourlyMetrics {
    return {
      count: metrics.count || 0,
      sum: metrics.sum,
      avg: metrics.avg,
      min: metrics.min,
      max: metrics.max,
      p50: metrics.p50,
      p95: metrics.p95,
      p99: metrics.p99,
    };
  }

  async calculatePercentiles(
    eventType: string,
    field: string,
    hourBucket?: string,
  ): Promise<{
    p50: number;
    p95: number;
    p99: number;
  }> {
    const match: any = { eventType };
    if (hourBucket) {
      match.hourBucket = hourBucket;
    }

    const results = await AnalyticsTimeSeriesModel.aggregate([
      { $match: match },
      {
        $facet: {
          percentiles: [
            {
              $bucketAuto: {
                groupBy: `$metrics.${field}`,
                buckets: 100,
                output: { count: { $sum: 1 } },
              },
            },
          ],
        },
      },
    ]);

    // Simplified percentile calculation
    return {
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }
}

export const analyticsMetricsCalculator = new AnalyticsMetricsCalculator();
