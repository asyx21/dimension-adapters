import {Adapter} from "../adapters/types";
import {ETHEREUM} from "../helpers/chains";
import {request, gql} from "graphql-request";
import type {ChainEndpoints} from "../adapters/types"
import {Chain} from '@defillama/sdk/build/general';
import {getTimestampAtStartOfDayUTC} from "../utils/date";
import BigNumber from "bignumber.js";

const endpoints = {
    [ETHEREUM]:
        "https://api.thegraph.com/subgraphs/name/convex-community/convex",
};


const methodology = {
    UserFees: "No user fees",
    Fees: "Includes all treasury revenue, all revenue to CVX lockers and stakers and all revenue to liquid derivatives (cvxCRV, cvxFXS)",
    HoldersRevenue: "All revenue going to CVX lockers and stakers, including bribes",
    Revenue: "Sum of protocol revenue and holders' revenue",
    ProtocolRevenue: "Share of revenue going to Convex treasury (includes caller incentives on Frax pools)",
    SupplySideRevenue: "All CRV, CVX and FXS rewards redistributed to liquidity providers staking on Convex.",
}

const graph = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number) => {
            const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp));
            console.log(dateId);

            const graphQuery = gql
                    `{
                    dailyRevenueSnapshot(id: ${dateId}) {
                        crvRevenueToLpProvidersAmount
                        cvxRevenueToLpProvidersAmount
                        fxsRevenueToLpProvidersAmount
                        crvRevenueToCvxCrvStakersAmount
                        cvxRevenueToCvxCrvStakersAmount
                        threeCrvRevenueToCvxCrvStakersAmount
                        fxsRevenueToCvxFxsStakersAmount
                        crvRevenueToCvxStakersAmount
                        fxsRevenueToCvxStakersAmount
                        crvRevenueToCallersAmount
                        fxsRevenueToCallersAmount
                        crvRevenueToPlatformAmount
                        fxsRevenueToPlatformAmount
                        bribeRevenue
                    }
                }`;

            const graphRes = await request(graphUrls[chain], graphQuery);
            Object.keys(graphRes.dailyRevenueSnapshot).map(function (k) {
                graphRes.dailyRevenueSnapshot[k] = new BigNumber(graphRes.dailyRevenueSnapshot[k])
            });
            const snapshot = graphRes.dailyRevenueSnapshot;

            // All revenue redirected to LPs
            const dailySupplySideRev = snapshot.crvRevenueToLpProvidersAmount.plus(snapshot.cvxRevenueToLpProvidersAmount).plus(snapshot.fxsRevenueToLpProvidersAmount);
            // Revenue to CVX Holders, including bribes (minus Votium fee)
            const dailyHoldersRevenue = snapshot.bribeRevenue.plus(snapshot.crvRevenueToCvxStakersAmount).plus(snapshot.fxsRevenueToCvxStakersAmount);
            // cvxCRV & cvxFXS liquid lockers revenue
            const liquidRevenue = snapshot.crvRevenueToCvxCrvStakersAmount.plus(snapshot.cvxRevenueToCvxCrvStakersAmount).plus(snapshot.threeCrvRevenueToCvxCrvStakersAmount).plus(snapshot.fxsRevenueToCvxFxsStakersAmount);
            // Share of revenue redirected to treasury, includes call incentives monopolized by the protocol (FXS)
            const dailyTreasuryRevenue = snapshot.crvRevenueToPlatformAmount.plus(snapshot.fxsRevenueToPlatformAmount).plus(snapshot.fxsRevenueToCallersAmount);

            // Platform fee on CRV rewards + Rewards to liquid lockers + Rewards to CVX holders
            const dailyFees = dailyTreasuryRevenue.plus(liquidRevenue).plus(dailyHoldersRevenue);
            // No fees levied on users
            const dailyUserFees = 0;
            // Platform fee on CRV/FXS rewards + Gov token holder revenue
            const dailyRevenue = dailyTreasuryRevenue.plus(dailyHoldersRevenue);

            return {
                timestamp,
                dailyFees: dailyFees.toString(),
                dailyUserFees: dailyUserFees.toString(),
                dailyHoldersRevenue: dailyHoldersRevenue.toString(),
                dailyProtocolRevenue: dailyTreasuryRevenue.toString(),
                dailySupplySideRevenue: dailySupplySideRev.toString(),
                dailyRevenue: dailyRevenue.toString(),
            };
        }
    }
};

const adapter: Adapter = {
    adapter: {
        [ETHEREUM]: {
            fetch: graph(endpoints)(ETHEREUM),
            start: async () => 1621224000,
            meta: {
                methodology
            }
        }
    }
}

export default adapter;
