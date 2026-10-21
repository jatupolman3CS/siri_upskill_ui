import {
  DEFAULT_TOP,
  defaultMonths,
  defaultRange,
  formatPercent,
  maxAbsOf,
  monthIssueOf,
  monthLabel,
  monthOf,
  monthOptions,
  parseFilters,
  parseIsoDate,
  parseMonth,
  parseTab,
  parseTop,
  percentOf,
  rangeIssueOf,
  rangeLimitOf,
  reportStatusOf,
} from './admin-analytics.util';

const TODAY = '2026-10-14';

describe('parseIsoDate / parseMonth / parseTop', () => {
  it('accepts a real calendar day and nothing else', () => {
    expect(parseIsoDate('2026-10-14')).toBe('2026-10-14');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('14/10/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });

  it('accepts a month written yyyy-MM', () => {
    expect(parseMonth('2026-09')).toBe('2026-09');
    expect(parseMonth('2026-00')).toBeNull();
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026-9')).toBeNull();
    expect(parseMonth(null)).toBeNull();
  });

  it('keeps a row count from 1 to 50 and falls back to the default for anything else', () => {
    expect(parseTop('10')).toBe(10);
    expect(parseTop('1')).toBe(1);
    expect(parseTop('50')).toBe(50);
    expect(parseTop('0')).toBe(DEFAULT_TOP);
    expect(parseTop('51')).toBe(DEFAULT_TOP);
    expect(parseTop('2.5')).toBe(DEFAULT_TOP);
    expect(parseTop('abc')).toBe(DEFAULT_TOP);
    expect(parseTop(null)).toBe(DEFAULT_TOP);
  });
});

describe('default periods', () => {
  it('covers the last 30 days, today included', () => {
    expect(defaultRange(TODAY)).toEqual({ from: '2026-09-15', to: '2026-10-14' });
    expect(defaultRange(TODAY, 7)).toEqual({ from: '2026-10-08', to: '2026-10-14' });
  });

  it('crosses a year end', () => {
    expect(defaultRange('2026-01-10')).toEqual({ from: '2025-12-12', to: '2026-01-10' });
  });

  it('covers the last 12 months, this month included', () => {
    expect(defaultMonths(TODAY)).toEqual({ fromMonth: '2025-11', toMonth: '2026-10' });
    expect(monthOf('2026-01-31', -1)).toBe('2025-12');
  });

  it('offers 24 months, newest first', () => {
    const months = monthOptions(TODAY);
    expect(months).toHaveLength(24);
    expect(months[0]).toBe('2026-10');
    expect(months[23]).toBe('2024-11');
  });
});

describe('rangeLimitOf', () => {
  it('uses the limits the contract states for each report', () => {
    expect(rangeLimitOf('revenue', 'Day')).toEqual({ unit: 'days', max: 92 });
    expect(rangeLimitOf('revenue', 'Week')).toEqual({ unit: 'weeks', max: 53 });
    expect(rangeLimitOf('revenue', 'Month')).toEqual({ unit: 'months', max: 24 });
    expect(rangeLimitOf('search', 'Day')).toEqual({ unit: 'days', max: 90 });
    expect(rangeLimitOf('tutors', 'Day')).toEqual({ unit: 'days', max: 366 });
  });

  it('states none where the contract names none - the funnel is left to the server', () => {
    expect(rangeLimitOf('funnel', 'Day')).toBeNull();
    expect(rangeLimitOf('kyc', 'Day')).toBeNull();
  });
});

describe('rangeIssueOf', () => {
  const days92 = rangeLimitOf('revenue', 'Day');

  it('accepts a period inside the limit', () => {
    expect(rangeIssueOf('2026-09-15', TODAY, TODAY, days92)).toBeNull();
  });

  it('counts both ends: 92 days is allowed, 93 is not', () => {
    expect(rangeIssueOf('2026-07-15', TODAY, TODAY, days92)).toBeNull();
    expect(rangeIssueOf('2026-07-14', TODAY, TODAY, days92)).toEqual({ code: 'tooLong', unit: 'days', max: 92 });
  });

  it('asks for two real days, in order, not after today', () => {
    expect(rangeIssueOf('', TODAY, TODAY, days92)).toEqual({ code: 'incomplete' });
    expect(rangeIssueOf('2026-10-10', 'x', TODAY, days92)).toEqual({ code: 'incomplete' });
    expect(rangeIssueOf('2026-10-14', '2026-10-01', TODAY, days92)).toEqual({ code: 'order' });
    expect(rangeIssueOf('2026-10-10', '2026-10-15', TODAY, days92)).toEqual({ code: 'future' });
  });

  it('checks weeks and months against their own limits', () => {
    expect(rangeIssueOf('2025-10-20', TODAY, TODAY, rangeLimitOf('revenue', 'Week'))).toBeNull();
    expect(rangeIssueOf('2025-09-01', TODAY, TODAY, rangeLimitOf('revenue', 'Week'))).toEqual({ code: 'tooLong', unit: 'weeks', max: 53 });
    expect(rangeIssueOf('2024-11-01', TODAY, TODAY, rangeLimitOf('revenue', 'Month'))).toBeNull();
    expect(rangeIssueOf('2024-10-01', TODAY, TODAY, rangeLimitOf('revenue', 'Month'))).toEqual({ code: 'tooLong', unit: 'months', max: 24 });
  });

  it('checks only order and future when the report has no stated limit', () => {
    expect(rangeIssueOf('2020-01-01', TODAY, TODAY, null)).toBeNull();
  });
});

describe('monthIssueOf', () => {
  it('accepts up to 24 months and not after this month', () => {
    expect(monthIssueOf('2025-11', '2026-10', TODAY)).toBeNull();
    expect(monthIssueOf('2024-11', '2026-10', TODAY)).toBeNull();
    expect(monthIssueOf('2024-10', '2026-10', TODAY)).toEqual({ code: 'tooLong', unit: 'months', max: 24 });
    expect(monthIssueOf('2026-09', '2026-11', TODAY)).toEqual({ code: 'future' });
    expect(monthIssueOf('2026-10', '2026-09', TODAY)).toEqual({ code: 'order' });
    expect(monthIssueOf(null, '2026-09', TODAY)).toEqual({ code: 'incomplete' });
  });
});

describe('parseFilters', () => {
  const read = (params: Readonly<Record<string, string>>) => parseFilters((key) => params[key] ?? null, TODAY);

  it('falls back to the last 30 days and 12 months, a daily step, all bookings, top 20 by completed lessons', () => {
    expect(read({})).toEqual({
      from: '2026-09-15',
      to: TODAY,
      granularity: 'Day',
      segment: 'All',
      sort: 'Completed',
      top: 20,
      fromMonth: '2025-11',
      toMonth: '2026-10',
    });
  });

  it('keeps what is valid in the address bar', () => {
    const filters = read({ from: '2026-08-01', to: '2026-08-31', granularity: 'Month', segment: 'Paid', sort: 'Rating', top: '10', fromMonth: '2026-01', toMonth: '2026-06' });

    expect(filters).toEqual({ from: '2026-08-01', to: '2026-08-31', granularity: 'Month', segment: 'Paid', sort: 'Rating', top: 10, fromMonth: '2026-01', toMonth: '2026-06' });
  });

  it('never lets a hand-edited URL reach the API as an unknown value', () => {
    const filters = read({ from: 'yesterday', to: '2026-02-30', granularity: 'Hour', segment: 'Everything', sort: 'Price', top: '9999', fromMonth: 'x', toMonth: '2026-99' });

    expect(filters.from).toBe('2026-09-15');
    expect(filters.to).toBe(TODAY);
    expect(filters.granularity).toBe('Day');
    expect(filters.segment).toBe('All');
    expect(filters.sort).toBe('Completed');
    expect(filters.top).toBe(20);
    expect(filters.fromMonth).toBe('2025-11');
    expect(filters.toMonth).toBe('2026-10');
  });

  it('ends a lone start at today and starts a lone end 30 days earlier', () => {
    expect(read({ from: '2026-10-01' })).toMatchObject({ from: '2026-10-01', to: TODAY });
    expect(read({ to: '2026-10-10' })).toMatchObject({ from: '2026-09-11', to: '2026-10-10' });
  });
});

describe('parseTab', () => {
  it('reads the six tabs and falls back to revenue', () => {
    expect(parseTab('kyc')).toBe('kyc');
    expect(parseTab('tutors')).toBe('tutors');
    expect(parseTab('<script>')).toBe('revenue');
    expect(parseTab(null)).toBe('revenue');
  });
});

describe('display helpers', () => {
  it('draws a bar as a share of the largest value, by size and never beyond the track', () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(-50, 200)).toBe(25);
    expect(percentOf(300, 200)).toBe(100);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(Number.NaN, 10)).toBe(0);
  });

  it('finds the scale of a list from its largest absolute value', () => {
    expect(maxAbsOf([10, -40, 25])).toBe(40);
    expect(maxAbsOf([])).toBe(0);
  });

  it('writes a rate as a percentage and keeps "no rate" as null', () => {
    expect(formatPercent(0.425)).toBe('42.5%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(null)).toBeNull();
  });

  it('names a month in the language of the header, in Thailand time', () => {
    expect(monthLabel('2026-10', 'en')).toBe('October 2026');
    expect(monthLabel('2026-10', 'th')).toContain('2026');
  });

  it('is ready once there is a value, even while it is read again; an error is an error', () => {
    const resource = (status: string, hasValue: boolean) => ({ status: () => status, hasValue: () => hasValue }) as never;

    expect(reportStatusOf(resource('loading', false))).toBe('loading');
    expect(reportStatusOf(resource('reloading', true))).toBe('ready');
    expect(reportStatusOf(resource('resolved', true))).toBe('ready');
    expect(reportStatusOf(resource('error', false))).toBe('error');
    expect(reportStatusOf(resource('error', true))).toBe('error');
  });
});
