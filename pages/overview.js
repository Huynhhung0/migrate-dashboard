import React, { useEffect, useState } from 'react';
import Router from 'next/router';
import Header from '@makerdao/ui-components-header';
import {
  Box,
  Flex,
  Text,
  Grid,
  Button,
  Card,
  Link,
  Loader,
  Tooltip
} from '@makerdao/ui-components-core';
import useMaker from '../hooks/useMaker';
import flatten from 'lodash/flatten';
import reduce from 'lodash/reduce';
import { getColor } from '../utils/theme';
import { prettifyNumber } from '../utils/ui';
import { TextBlock, Breakout } from '../components/Typography';
import ButtonCard from '../components/ButtonCard';
import Subheading from '../components/Subheading';
import useStore from '../hooks/useStore';
import { SAI, DAI, PETH } from '../maker';
import TooltipContents from '../components/TooltipContents';
import { shutDown } from '../plugin/test/helpers';
import { stringToBytes, fromRay, fromRad, fromWei } from '../utils/ethereum';
import BigNumber from 'bignumber.js';
import ilkList from '../references/ilkList';

function clock(delta) {

  const hours = Math.floor(delta / 3600);
  delta -= hours * 3600;

  const minutes = Math.floor(delta / 60) % 60;
  delta -= minutes * 60;

  const seconds = Math.floor(delta) % 60;

  const pad = val => (val < 10 ? '0' + val.toString() : val.toString());

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const Timer = ({ seconds, prefix, children }) => {
  // initialize timeLeft with the seconds prop
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    if (!timeLeft) return;

    const intervalId = setInterval(() => {
      setTimeLeft(timeLeft - 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, [timeLeft]);

  return (
    <Flex>
      <Text.p fontSize="15px" fontWeight={500} color={getColor('steel')}>
        {prefix} {clock(timeLeft)}
        <Tooltip
          fontSize="m"
          ml="xs"
          color={getColor('steel')}
          content={<TooltipContents>{children}</TooltipContents>}
        />
      </Text.p>
    </Flex>
  );
};

function MigrationCard({
  title,
  children,
  metadataTitle,
  metadataValue,
  onSelected,
  buttonLabel = 'Continue',
  disabled = false
}) {
  return (
    <ButtonCard
      minHeight="25.3rem"
      buttonTag={
        <Grid gridRowGap="2xs">
          <Text t="heading" color="teal.500" alignSelf="center" ml="s">
            {metadataValue} {metadataTitle}
          </Text>
        </Grid>
      }
      button={
        <Button
          px="xl"
          disabled={disabled}
          variant="primary"
          onClick={onSelected}
        >
          {buttonLabel}
        </Button>
      }
    >
      <Grid
        gridTemplateAreas='"title recommended" "body body"'
        gridTemplateColumns="1fr auto"
        gridColumnGap="m"
        gridRowGap="m"
      >
        <Box gridArea="title" alignSelf="center">
          <Text.h4>{title}</Text.h4>
        </Box>
        <Box gridArea="body">{children}</Box>
      </Grid>
    </ButtonCard>
  );
}

function countCdps(cdps) {
  return reduce(cdps, (count, list) => count + list.length, 0);
}

function showCdpCount(cdps) {
  if (!cdps) return '...';
  return countCdps(cdps);
}

function showAmount(tok) {
  if (!tok) return '...';
  return prettifyNumber(tok, false, 2, false);
}

function OverviewDataFetch() {
  const [, dispatch] = useStore();
  const { maker, account } = useMaker();
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (maker && !account) Router.replace('/');
  }, [maker, account]);

  useEffect(() => {
    (async () => {
      if (!maker || !account) return;
      const mig = maker.service('migration');
      // the following can be removed when we're done testing this
      if (global.scdESTest && global.testnet) {
        const off = await mig.getMigration('redeem-sai').off();
        if (!off) {
          console.log('shutting down');
          await shutDown(true);
        }
      }
      const checks = await mig.runAllChecks();

      const daiBalance = DAI(await maker.getToken('MDAI').balance());
      const end = maker.service('smartContract').getContract('MCD_END_1');
      const live = await end.live();
      const emergencyShutdownActive = live.eq(0);
      let endBalance = DAI(0), dsrBalance = DAI(0), daiDsrEndBalance = DAI(0),
        bagBalance = DAI(0), proxyDaiAllowance = DAI(0), validClaims,
        parsedVaultsData, wait, when, systemDebt, fixedPrices, tagPrices,
        emergencyShutdownTime, minEndVatBalance, secondsUntilAuctionClose,
        outAmounts, proxyAddress;
      if (emergencyShutdownActive) {
        const fixElement = async ilk => {
          const price = await end.fix(stringToBytes(ilk)).then(fromRay);
          return {
            ilk,
            price
          };
        };

        const tagElement = async ilk => {
          const price = await end.tag(stringToBytes(ilk)).then(fromRay);
          return {
            ilk,
            price
          };
        };

        const ilkKeys = ilkList.map(i => i.key);

        const outElement = async ilk => {
          const out = proxyAddress
            ? await end.out(stringToBytes(ilk), proxyAddress).then(fromWei)
            : BigNumber(0);
          return {
            ilk,
            out
          };
        };

        [
          wait,
          when,
          systemDebt,
          fixedPrices,
          tagPrices,
          proxyAddress,
          dsrBalance,
          outAmounts
        ] = await Promise.all([
          end.wait(),
          end.when(),
          end.debt().then(fromRad),
          Promise.all(ilkKeys.map(ilk => fixElement(ilk))),
          Promise.all(ilkKeys.map(ilk => tagElement(ilk))),
          maker.service('proxy').currentProxy(),
          maker.service('mcd:savings').balance(),
          Promise.all(ilkKeys.map(ilk => outElement(ilk)))
        ]);
        const emergencyShutdownTime = new Date(when.toNumber() * 1000);
        const auctionCloseTime = new Date(
          emergencyShutdownTime.getTime() + wait.toNumber() * 1000
        );

        const diff = Math.floor(
          (auctionCloseTime.getTime() - Date.now()) / 1000
        );

        secondsUntilAuctionClose = diff > 0 ? diff : 0;

        const claims = checks['global-settlement-collateral-claims'];

        if (claims){
          validClaims = claims.filter(c => c.redeemable);

          const vaultsData = await Promise.all([
            ...validClaims.map(({ id }) =>
              maker.service('mcd:cdpManager').getCdp(parseInt(id))
            )
          ]);

          parsedVaultsData = vaultsData.map(vault => {
            const claim = validClaims.find(c => c.id.toNumber() === vault.id);
            const currency = vault.type.ilk.split('-')[0];
            const vaultValue = vault.collateralAmount
              .toBigNumber()
              .minus(vault.debtValue.toBigNumber().times(claim.tag));
            return {
              id: vault.id,
              type: currency,
              collateral: `${prettifyNumber(
                vault.collateralAmount,
                false,
                vault.collateralAmount.gt(0.01) ? 2 : 4
              )}`,
              daiDebt: `${prettifyNumber(vault.debtValue, false, 2, false)} DAI`,
              vault,
              shutdownValue: `$${prettifyNumber(BigNumber(1).div(claim.tag))}`,
              exchangeRate: `1 DAI : ${prettifyNumber(
                claim.tag,
                false,
                4
              )} ${currency}`,
              vaultValue: `${prettifyNumber(
                vaultValue,
                false,
                vaultValue.gt(0.01) ? 2 : 4
              )} ${currency}`
            };
          });
        }

        if (proxyAddress) {
          bagBalance = DAI(
            await maker
              .service('migration')
              .getMigration('global-settlement-dai-redeemer')
              .bagAmount(proxyAddress)
          );
          endBalance = bagBalance.minus(
            BigNumber.min.apply(
              null,
              outAmounts.map(o => o.out)
            )
          );
        }
        daiDsrEndBalance = daiBalance
        .plus(endBalance)
        .plus(dsrBalance);
        if (daiDsrEndBalance.gt(0)){

          if (proxyAddress) {
            proxyDaiAllowance = await maker
              .getToken(DAI)
              .allowance(account.address, proxyAddress);
          }

          const endVatBalancesInDai = await Promise.all(
            ilkKeys.map(async ilk => {
              const gem = await maker
                .service('migration')
                .getMigration('global-settlement-dai-redeemer')
                .endGemBalance(ilk);
              return gem.dividedBy(fixedPrices.find(p => p.ilk === ilk).price);
            })
          );
          minEndVatBalance = BigNumber.min.apply(null, endVatBalancesInDai);
        }
      }

      const cdpMigrationCheck = checks['single-to-multi-cdp'];

      const pethInVaults = [];
      const scs = maker.service('smartContract');
      const tub = scs.getContract('SAI_TUB');
      const top = scs.getContract('SAI_TOP');
      const scd = { off: await tub.off() }; // SCD is shut down

      if (scd.off && countCdps(cdpMigrationCheck) > 0) {
        Object.assign(scd, {
          caged: await top.caged(), // time of shutdown
          cooldown: await top.cooldown(), // cooldown time length
          out: await tub.out() // cooldown is over
        });
        const cdpService = maker.service('cdp');
        const ids = flatten(Object.values(checks['single-to-multi-cdp']));
        for (const id of ids) {
          const value = await cdpService.getCollateralValue(id, PETH);
          pethInVaults.push([id, PETH(value)]);
        }
      }

      setFetching(false);

      dispatch({
        type: 'assign',
        payload: {
          emergencyShutdownActive,
          cdpMigrationCheck,
          saiBalance: SAI(checks['sai-to-dai']),
          oldMkrBalance: checks['mkr-redeemer'],
          chiefMigrationCheck: checks['chief-migrate'],
          scd,
          pethInVaults,
          emergencyShutdownTime,
          secondsUntilAuctionClose,
          systemDebt,
          fixedPrices,
          tagPrices,
          outAmounts,
          daiBalance,
          endBalance,
          dsrBalance,
          bagBalance,
          proxyAddress,
          daiDsrEndBalance,
          vaultsToRedeem: { claims: validClaims, parsedVaultsData },
          minEndVatBalance,
          proxyDaiAllowance
        }
      });
    })();
  }, [maker, account, dispatch]);

  return <Overview fetching={fetching} />;
}

function Overview({ fetching }) {
  const { account } = useMaker();
  const [
    {
      emergencyShutdownActive,
      secondsUntilAuctionClose,
      systemDebt,
      fixedPrices,
      cdpMigrationCheck: cdps,
      saiBalance,
      daiBalance,
      daiDsrEndBalance,
      saiAvailable,
      daiAvailable,
      oldMkrBalance,
      chiefMigrationCheck,
      vaultsToRedeem,
      scd = {},
      pethInVaults
    }
  ] = useStore();

  const { mkrLockedDirectly, mkrLockedViaProxy } = chiefMigrationCheck || {};
  const shouldShowCdps = countCdps(cdps) > 0 && saiAvailable.gt(0);
  const shouldShowDai = saiBalance && saiBalance.gt(0);
  const shouldShowMkr = oldMkrBalance && oldMkrBalance.gt(0);
  const shouldShowReverse =
    daiBalance && daiBalance.gt(0) && saiAvailable.gt(0);
  const shouldShowChief =
    chiefMigrationCheck && (mkrLockedDirectly.gt(0) || mkrLockedViaProxy.gt(0));
  const shouldShowCollateral =
    daiDsrEndBalance &&
    daiDsrEndBalance.gt(0) &&
    emergencyShutdownActive &&
    secondsUntilAuctionClose !== undefined &&
    systemDebt !== undefined &&
    fixedPrices !== undefined;
  const shouldShowRedeemVaults =
    vaultsToRedeem && vaultsToRedeem.claims && vaultsToRedeem.claims.length > 0;

  const shouldShowSCDESCollateral =
    scd.off && pethInVaults.some(x => x[1].gt(0));
  const shouldShowSCDESSai = scd.off && shouldShowDai;

  const noMigrations =
    !shouldShowCdps &&
    !shouldShowDai &&
    !shouldShowMkr &&
    !shouldShowReverse &&
    !shouldShowChief &&
    !shouldShowCollateral &&
    !shouldShowRedeemVaults &&
    !shouldShowSCDESCollateral &&
    !shouldShowSCDESSai;

  return (
    <Flex flexDirection="column" minHeight="100vh">
      <Header />
      <Box borderBottom="1px solid" borderColor="grey.300" />
      <div>
        <Subheading account={account} />
      </div>

      <Box maxWidth="112.5rem" width="100%" mx="auto" px="m" flexGrow="1">
        <Box mt={{ s: 'm', m: '2xl' }} maxWidth="82.2rem" width="100%">
          <Text.h2 mb="s" textAlign={{ s: 'center', l: 'left' }}>
            Migrate and Upgrade
          </Text.h2>
          <Breakout textAlign={{ s: 'center', l: 'left' }}>
            Use Migrate after system updates to move your Dai and CDPs into
            their new versions.
          </Breakout>
        </Box>

        <Grid
          mt="l"
          gridTemplateColumns={{ s: '1fr', l: '1fr 1fr' }}
          gridGap="l"
        >
          {shouldShowCdps && (
            <MigrationCard
              title="CDP Upgrade"
              metadataTitle={`CDP${
                countCdps(cdps) === 1 ? '' : 's'
              } to upgrade`}
              metadataValue={showCdpCount(cdps)}
              onSelected={() => Router.push('/migration/cdp')}
            >
              <Text.p t="body">
                Upgrade your CDPs to Multi-Collateral Dai and Oasis. Current Sai
                liquidity: {prettifyNumber(saiAvailable)}
              </Text.p>
            </MigrationCard>
          )}
          {shouldShowDai && (
            <MigrationCard
              title="Single-Collateral Sai Upgrade"
              metadataTitle="Sai to upgrade"
              metadataValue={showAmount(saiBalance)}
              onSelected={() => Router.push('/migration/dai')}
              disabled={daiAvailable.eq(0)}
            >
              <Text.p t="body">
              {daiAvailable.gt(0) ? `Upgrade your Single-Collateral Sai to Multi-Collateral Dai. Current Dai availability: ${prettifyNumber(
                daiAvailable
              )}` : 'Swapping Sai for Dai is no longer possible through the Migration Portal. Please visit a decentralized exchange to swap your Sai tokens.'}
              </Text.p>
            </MigrationCard>
          )}
          {shouldShowReverse && (
            <MigrationCard
              title="Swap Dai for Sai"
              metadataTitle="Dai available to swap"
              metadataValue={showAmount(daiBalance)}
              onSelected={() => {
                Router.push('/migration/sai');
              }}
            >
              <Text.p t="body">
                Swap your Multi-Collateral Dai back to Single-Collateral Sai.
                Current Sai liquidity: {prettifyNumber(saiAvailable)}
              </Text.p>
            </MigrationCard>
          )}
          {shouldShowChief && (
            <MigrationCard
              title="DSChief MKR Withdrawal"
              metadataTitle="MKR to claim"
              metadataValue={showAmount(
                mkrLockedDirectly.plus(mkrLockedViaProxy)
              )}
              onSelected={() => {
                window.open('https://chief-migration.makerdao.com/', '_blank');
              }}
            >
              <Text.p t="body">
                Due to the recent discovery of a potential exploit in the Maker
                Governance Contract (DSChief), all users are requested to
                withdraw any MKR deposited into one of the voting contracts back
                to their wallet.
              </Text.p>
            </MigrationCard>
          )}
          {shouldShowRedeemVaults && (
            <MigrationCard
              title="Withdraw Excess Collateral from Vaults"
              metadataTitle="vaults to redeem"
              metadataValue={vaultsToRedeem.claims.length}
              onSelected={() => Router.push('/migration/vaults')}
            >
              <Text.p t="body">
                Withdraw excess collateral from your Multi-Collateral Dai
                Vaults.
              </Text.p>
            </MigrationCard>
          )}
          {shouldShowMkr && (
            <MigrationCard
              recommended
              title="Redeem Old MKR"
              onSelected={() => {
                window.open('https://makerdao.com/redeem/', '_blank');
              }}
            >
              <Text.p t="body">
                Swap your old MKR for new MKR by upgrading to the new ds-token.
              </Text.p>
            </MigrationCard>
          )}

          {shouldShowCollateral && (
            <MigrationCard
              title="Redeem Dai for collateral"
              metadataTitle="Dai to redeem"
              metadataValue={showAmount(daiDsrEndBalance)}
              onSelected={() => {
                Router.push('/migration/redeemDai');
              }}
              disabled={
                !systemDebt.gt(0) ||
                secondsUntilAuctionClose > 0 ||
                !fixedPrices.every(({ price }) => price.gt(0))
              }
            >
              <Grid gridRowGap="l">
                <Text.p t="body">
                  Redeem your Dai for a proportional amount of underlying
                  collateral from the Multi-Collateral Dai system
                </Text.p>
                {secondsUntilAuctionClose > 0 ? (
                  <Timer
                    seconds={secondsUntilAuctionClose}
                    prefix="Auctions in progress. Cooldown ends in"
                  >
                    Dai holders need to wait for the cooldown period to complete
                    because vaults have priority as their debt needs to be
                    cleared first. This will allow the correct amount of
                    underlying collateral to be calculated as part of your Dai
                    redemption.
                  </Timer>
                ) : !systemDebt.gt(0) ? (
                  <Text.p
                    fontSize="15px"
                    fontWeight={500}
                    color={getColor('steel')}
                  >
                    The end.thaw() function must be triggered before DAI can be
                    redeemed.
                  </Text.p>
                ) : !fixedPrices.every(({ price }) => price.gt(0)) ? (
                  <Text.p
                    fontSize="15px"
                    fontWeight={500}
                    color={getColor('steel')}
                  >
                    The end.flow() function must be executed on each collateral
                    type.
                  </Text.p>
                ) : (
                  'You can now redeem your DAI for collateral'
                )}
              </Grid>
            </MigrationCard>
          )}

          {shouldShowSCDESCollateral && (
            <SCDESCollateralCard {...{ scd, pethInVaults }} />
          )}
          {shouldShowSCDESSai && (
            <MigrationCard
              title="Redeem Sai for Collateral"
              onSelected={() => Router.push('/migration/scd-es-sai')}
              metadataTitle="Sai to redeem"
              metadataValue={showAmount(saiBalance)}
            >
              <Text.p t="body">
                Redeem your Single-Collateral Sai for a proportional
                amount of ETH from the Single-Collateral Sai system.
              </Text.p>
            </MigrationCard>
          )}
        </Grid>
        {fetching ? (
          <Loader
            mt="4rem"
            mb="4rem"
            size="1.8rem"
            color={getColor('makerTeal')}
            justifySelf="end"
            m="auto"
            bg={getColor('lightGrey')}
          />
        ) : (
          noMigrations && (
            <Card mt="l">
              <Flex justifyContent="center" py="l" px="m">
                <Text.p textAlign="center" t="body">
                  You&apos;re all set! There are no migrations or redemptions to
                  make using this wallet.
                  <br />
                  <Text.span display={{ s: 'block', m: 'none' }} mt="m" />
                  Please visit us at <Link>chat.makerdao.com</Link> if you have
                  any questions.
                </Text.p>
              </Flex>
            </Card>
          )
        )}
      </Box>
    </Flex>
  );
}

function SCDESCollateralCard({ scd, pethInVaults }) {
  const { out, caged, cooldown } = scd;
  const endTime = caged.toNumber() + cooldown.toNumber();
  const [seconds, setSeconds] = useState();
  const total = pethInVaults.reduce((sum, v) => sum.plus(v[1]), PETH(0));

  useEffect(() => {
    const val = endTime - new Date().getTime() / 1000;
    setSeconds(val);
    setTimeout(() => setSeconds(0), val * 1000);
  }, [endTime]);

  return (
    <MigrationCard
      title="Withdraw ETH from Sai CDPs"
      metadataTitle="PETH in CDP(s)"
      metadataValue={showAmount(total)}
      onSelected={() => Router.push('/migration/scd-es-cdp')}
      disabled={!out}
    >
      <>
        <Text.p t="body">
          Redeem your PETH from your Single-Collateral Sai CDPs for a
          proportional amount of ETH from the system.
        </Text.p>
        {!out && (
          <TextBlock t="body" mt={'m'} color="#708390" fontWeight="500">
            {seconds > 0 ? (
              <Timer
                seconds={seconds}
                prefix="Sai redemption in progress. Cooldown period ends in"
              >
                CDP holders must wait for all outstanding debt to be removed in
                order to balance out the ETH:PETH ratio.
              </Timer>
            ) : (
              <>
                Cooldown period has ended and access will be granted soon.
                Reload the page to see.
              </>
            )}
          </TextBlock>
        )}
      </>
    </MigrationCard>
  );
}

export default OverviewDataFetch;
