import { format, parse, eachMonthOfInterval, startOfMonth, endOfMonth, min, max, eachDayOfInterval } from 'date-fns';
import { loadConfig } from '../utils/config-loader.js';
import Logger from '../utils/logger.js';
import UpstoxClient from './upstox-client.js';
import DataCache from './data-cache.js';
import { isTradingDay } from '../utils/date-utils.js';

async function fetchHistoricalData() {
  const config = loadConfig();
  const logger = new Logger(config.logging);
  const upstoxClient = new UpstoxClient(config, logger);
  const dataCache = new DataCache(logger);

  logger.info('Starting historical data fetch');
  
  const startDate = parse(config.backtest.startDate, 'yyyy-MM-dd', new Date());
  const endDate = parse(config.backtest.endDate, 'yyyy-MM-dd', new Date());
  
  console.log('\n' + '='.repeat(80));
  console.log('FETCHING REAL HISTORICAL DATA FROM UPSTOX');
  console.log('='.repeat(80));
  console.log(`Period: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
  console.log(`Instruments: ${config.trading.instruments.join(', ')}`);
  console.log('\n⚠️  IMPORTANT: Upstox 1-minute data can only be fetched 1 month at a time');
  console.log('This will take several minutes with rate limiting...\n');
  
  for (const instrument of config.trading.instruments) {
    logger.info(`Fetching data for ${instrument}`);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Instrument: ${instrument}`);
    console.log('='.repeat(80));
    
    const missingDates = dataCache.getMissingDates(instrument, startDate, endDate);
    
    if (missingDates.length === 0) {
      logger.info(`All data for ${instrument} already cached`);
      console.log(`✓ All data already cached\n`);
      continue;
    }

    console.log(`Missing ${missingDates.length} days of data`);
    console.log('Fetching month by month...\n');
    
    // Group missing dates by month (Upstox constraint: 1 month of 1-min data per request)
    const months = eachMonthOfInterval({ start: startDate, end: endDate });
    
    for (const monthStart of months) {
      const monthEnd = min([endOfMonth(monthStart), endDate]);
      const monthLabel = format(monthStart, 'MMMM yyyy');
      
      // Get trading days in this month that are missing
      const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const monthMissingDays = monthDays.filter(day => 
        isTradingDay(day) && missingDates.some(md => 
          format(md, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
        )
      );
      
      if (monthMissingDays.length === 0) {
        console.log(`  ${monthLabel}: ✓ Already cached`);
        continue;
      }
      
      console.log(`  ${monthLabel}: Fetching ${monthMissingDays.length} trading days...`);
      
      try {
        // Fetch entire month at once (Upstox allows 1 month of 1-min data per call)
        const monthStartStr = format(monthStart, 'yyyy-MM-dd');
        const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
        
        logger.info(`Fetching month of data`, {
          instrument,
          month: monthLabel,
          from: monthStartStr,
          to: monthEndStr
        });
        
        const monthData = await upstoxClient.getHistoricalData(
          instrument,
          config.backtest.interval,
          monthStartStr,
          monthEndStr
        );

        if (!monthData || monthData.length === 0) {
          logger.warn(`No data received for ${instrument} in ${monthLabel}`);
          console.log(`    ⚠ No data received`);
          continue;
        }

        // Split month data by day and cache each day separately
        const dayGroups = {};
        monthData.forEach(candle => {
          const dayKey = format(candle.timestamp, 'yyyy-MM-dd');
          if (!dayGroups[dayKey]) {
            dayGroups[dayKey] = [];
          }
          dayGroups[dayKey].push(candle);
        });

        let cachedDays = 0;
        for (const [dayKey, candles] of Object.entries(dayGroups)) {
          const dayDate = parse(dayKey, 'yyyy-MM-dd', new Date());
          if (isTradingDay(dayDate)) {
            dataCache.saveToCache(instrument, dayDate, candles);
            cachedDays++;
          }
        }

        console.log(`    ✓ Cached ${cachedDays} days (${monthData.length} candles)`);
        logger.info(`Cached month data`, {
          instrument,
          month: monthLabel,
          days: cachedDays,
          candles: monthData.length
        });

        // Rate limiting - wait 2 seconds between month requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        logger.error(`Error fetching month data`, {
          instrument,
          month: monthLabel,
          error: error.message,
          response: error.response?.data
        });
        console.log(`    ✗ Error: ${error.message}`);
        
        // Continue with next month even if one fails
        continue;
      }
    }
    
    console.log(`\n✓ Completed ${instrument}\n`);
  }

  console.log('='.repeat(80));
  console.log('HISTORICAL DATA FETCH COMPLETE');
  console.log('='.repeat(80));
  logger.info('Historical data fetch complete');
  
  // Verify what we got
  console.log('\nVerifying cached data...\n');
  for (const instrument of config.trading.instruments) {
    const remaining = dataCache.getMissingDates(instrument, startDate, endDate);
    console.log(`${instrument}: ${remaining.length > 0 ? `⚠ ${remaining.length} days still missing` : '✓ All data cached'}`);
  }
  console.log();
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || 
    import.meta.url.endsWith('fetch-historical.js')) {
  console.log('\n🔄 Starting historical data fetch from Upstox API...\n');
  fetchHistoricalData()
    .then(() => {
      console.log('\n✅ Data fetch completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Data fetch failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

export default fetchHistoricalData;
