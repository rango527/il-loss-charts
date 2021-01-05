import BigNumber from 'bignumber.js';
import { format } from 'date-fns';

import Uniswap from './uniswap';

export function calculateLPStats({ pairData, historicalData, lpShare: lpLiquidityUSD, lpDate }) {
    if (historicalData.length === 0) return null;

    const dailyLiquidity = [];
    const runningVolume = [];
    const runningPoolFees = [];
    const runningFees = [];
    const runningImpermanentLoss = [];
    const runningReturn = [];
    const days = [];

    const calculateImpermanentLoss = (startDailyData, endDailyData, lpLiquidity) => {
        const initialExchangeRate = new BigNumber(startDailyData.reserve0).div(new BigNumber(startDailyData.reserve1));
        const currentExchangeRate = new BigNumber(endDailyData.reserve0).div(new BigNumber(endDailyData.reserve1));
        const priceRatio = currentExchangeRate.div(initialExchangeRate);
        const impermanentLossPct = new BigNumber(2).times(priceRatio.sqrt()).div(priceRatio.plus(1)).minus(1);
        const impermanentLoss = impermanentLossPct.times(new BigNumber(lpLiquidity));

        return impermanentLoss;
    }

    let firstDaily = null;
    historicalData.forEach((dailyData, index) => {
        // Ignore if below lp date
        const currentDate = new Date(dailyData.date * 1000);
        if (currentDate.getTime() < lpDate.getTime()) return;
        if (!firstDaily) firstDaily = dailyData;
        if (index === 0) return;

        const poolShare = new BigNumber(lpLiquidityUSD).div(dailyData.reserveUSD);

        const vol = new BigNumber(dailyData.dailyVolumeUSD);
        const liquidity = new BigNumber(dailyData.reserveUSD);
        const dailyPoolFees = vol.times(Uniswap.FEE_RATIO);
        const dailyFees = dailyPoolFees.times(poolShare);
        const newRunningFees = (runningFees[runningFees.length - 1] ?? new BigNumber(0)).plus(dailyFees);
        const dailyImpermanentLoss = calculateImpermanentLoss(firstDaily, dailyData, lpLiquidityUSD);
        const dailyReturn = newRunningFees.plus(dailyImpermanentLoss);

        dailyLiquidity.push(liquidity);
        runningVolume.push((runningVolume[runningVolume.length - 1] ?? new BigNumber(0)).plus(vol));
        runningPoolFees.push((runningPoolFees[runningPoolFees.length - 1] ?? new BigNumber(0)).plus(dailyPoolFees));
        runningFees.push(newRunningFees);
        runningImpermanentLoss.push(dailyImpermanentLoss);
        runningReturn.push(dailyReturn);

        days.push(format(currentDate, 'MMM d'));
    });

    const totalFees = runningFees[runningFees.length - 1];
    const impermanentLoss = calculateImpermanentLoss(firstDaily, historicalData[historicalData.length - 1], lpLiquidityUSD);
    const totalReturn = totalFees.plus(impermanentLoss);

    // Calculate 24h and 7d stats
    const lastDailyIndex = runningVolume.length - 1;
    const dailyStartIndex = runningVolume.length - 2;
    const prevDayStartIndex = runningVolume.length - 3;
    const weeklyStartIndex = runningVolume.length - 8;
    const prevWeekStartIndex = runningVolume.length - 15;

    const totalStats = {
        volumeUSD: pairData.volumeUSD,
        liquidityUSD: pairData.reserveUSD,
        feesUSD: pairData.feesUSD
    };

    let lastDayStats, prevDayStats, lastWeekStats, prevWeekStats;

    if (runningVolume.length > 1) {
        lastDayStats = {
            volumeUSD: runningVolume[lastDailyIndex].minus(runningVolume[dailyStartIndex]),
            liquidityUSD: dailyLiquidity[lastDailyIndex],
            feesUSD: runningPoolFees[lastDailyIndex].minus(runningPoolFees[dailyStartIndex]),
        };
    }

    if (runningVolume.length > 2) {
        prevDayStats = {
            volumeUSD: runningVolume[dailyStartIndex].minus(runningVolume[prevDayStartIndex]),
            liquidityUSD: dailyLiquidity[dailyStartIndex],
            feesUSD: runningPoolFees[dailyStartIndex].minus(runningPoolFees[prevDayStartIndex]),
        };

        lastDayStats.volumeUSDChange = lastDayStats.volumeUSD.minus(prevDayStats.volumeUSD).div(prevDayStats.volumeUSD);
        lastDayStats.liquidityUSDChange = lastDayStats.liquidityUSD.minus(prevDayStats.liquidityUSD).div(prevDayStats.liquidityUSD);
        lastDayStats.feesUSDChange = lastDayStats.feesUSD.minus(prevDayStats.feesUSD).div(prevDayStats.feesUSD);
    }

    if (runningVolume.length > 7) {
        lastWeekStats = {
            volumeUSD: runningVolume[lastDailyIndex].minus(runningVolume[weeklyStartIndex]),
            liquidityUSD: dailyLiquidity[lastDailyIndex],
            feesUSD: runningPoolFees[lastDailyIndex].minus(runningPoolFees[weeklyStartIndex]),
        };
    }

    if (runningVolume.length > 14) {
        prevWeekStats = {
            volumeUSD: runningVolume[weeklyStartIndex].minus(runningVolume[prevWeekStartIndex]),
            liquidityUSD: dailyLiquidity[weeklyStartIndex],
            feesUSD: runningPoolFees[weeklyStartIndex].minus(runningPoolFees[prevWeekStartIndex]),
        };

        lastWeekStats.volumeUSDChange = lastWeekStats.volumeUSD.minus(prevWeekStats.volumeUSD).div(prevWeekStats.volumeUSD);
        lastWeekStats.liquidityUSDChange = lastWeekStats.liquidityUSD.minus(prevWeekStats.liquidityUSD).div(prevWeekStats.liquidityUSD);
        lastWeekStats.feesUSDChange = lastWeekStats.feesUSD.minus(prevWeekStats.feesUSD).div(prevWeekStats.feesUSD);
    }

    return {
        totalStats,
        lastDayStats,
        prevDayStats,
        lastWeekStats,
        prevWeekStats,
        dailyLiquidity,
        totalFees,
        runningVolume,
        runningFees,
        runningImpermanentLoss,
        runningReturn,
        impermanentLoss,
        totalReturn,
        days
    };
}

export function calculatePairRankings(pairs) {
    const byVolume = [...pairs].sort((a, b) => new BigNumber(a.volumeUSD).minus(new BigNumber(b.volumeUSD)).toNumber());
    const byLiquidity = [...pairs].sort((a, b) => new BigNumber(b.reserveUSD).minus(new BigNumber(a.reserveUSD)).toNumber());
    const liquidityLookup = byLiquidity.reduce((acc, pair, index) => ({ ...acc, [pair.id]: index + 1 }), {});

    const pairLookups = pairs.reduce((acc, pair, index) => ({
        ...acc,
        [pair.id]: {
            ...pair,
            volumeRanking: parseInt(index, 10) + 1,
            liquidityRanking: liquidityLookup[pair.id]
        }
    }), {});

    return {
        byVolume,
        byLiquidity,
        pairs,
        pairLookups
    };
}