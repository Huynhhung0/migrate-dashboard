import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  Grid,
  Table,
  Button,
  Checkbox,
  Link,
  CardTabs
} from '@makerdao/ui-components-core';
import { MKR } from '@makerdao/dai-plugin-mcd';
import { prettifyNumber } from '../../utils/ui';
import useMaker from '../../hooks/useMaker';
import useStore from '../../hooks/useStore';
import { addToastWithTimeout } from '../Toast';
import LoadingToggle from '../LoadingToggle';

const APPROVAL_FUDGE = 2;

const PayAndMigrate = ({
  onPrev,
  onNext,
  selectedCDP,
  setMigrationTxHash,
  setCdps,
  setNewCdpId
}) => {
  const [hasReadTOS, setHasReadTOS] = useState(false);
  const [mkrApprovePending, setMkrApprovePending] = useState(false);
  const [proxyDetails, setProxyDetails] = useState({});
  const [, dispatch] = useStore();
  const { maker, account } = useMaker();
  const { govFeeMKRExact } = selectedCDP;

  const giveProxyMkrAllowance = useCallback(async () => {
    setMkrApprovePending(true);
    try {
      await maker
        .getToken(MKR)
        .approve(proxyDetails.address, govFeeMKRExact.times(APPROVAL_FUDGE));
      setProxyDetails(proxyDetails => ({
        ...proxyDetails,
        hasMkrAllowance: true
      }));
    } catch (err) {
      const errMsg = `unlock mkr tx failed ${err}`;
      console.error(errMsg);
      addToastWithTimeout(errMsg, dispatch);
    }
    setMkrApprovePending(false);
  }, [maker, proxyDetails, govFeeMKRExact]);

  const migrateCdp = async () => {
    try {
      const mig = await maker
        .service('migration')
        .getMigration('single-to-multi-cdp');
      const migrationTxObject = mig.execute(selectedCDP.id);
      maker.service('transactionManager').listen(migrationTxObject, {
        pending: tx => setMigrationTxHash(tx.hash)
      });
      const newId = await migrationTxObject;
      setNewCdpId(newId);
      setCdps(cdps => cdps.filter(c => c !== selectedCDP));
      onNext();
    } catch (err) {
      const errMsg = `migrate tx failed ${err}`;
      console.error(errMsg);
      addToastWithTimeout(errMsg, dispatch);
      onPrev();
    }
  };

  useEffect(() => {
    (async () => {
      if (maker && account) {
        // assuming they have a proxy
        const proxyAddress = await maker.service('proxy').currentProxy();
        if (proxyAddress) {
          const connectedWalletAllowance = await maker
            .getToken(MKR)
            .allowance(account.address, proxyAddress);
          const hasMkrAllowance = connectedWalletAllowance.gte(
            govFeeMKRExact.times(APPROVAL_FUDGE)
          );
          setProxyDetails({ hasMkrAllowance, address: proxyAddress });
        }
      }
    })();
  }, [account, maker, govFeeMKRExact]);

  const maxCost =
    parseFloat(selectedCDP.govFeeDai) +
    parseFloat(selectedCDP.govFeeDai) * 0.05;

  const minNewCollatRatio = selectedCDP.collateralValueExact
    .dividedBy(selectedCDP.debtValueExact.plus(maxCost))
    .times(100)
    .toNumber();

  return (
    <Grid
      maxWidth="912px"
      gridRowGap="l"
      px={['s', 0]}
      mx={[0, 'auto']}
      width={['100vw', 'auto']}
    >
      <Text.h2 textAlign="center">Confirm CDP Migration</Text.h2>
      <CardTabs headers={['Pay with MKR', 'Pay with CDP debt']}>
        <Grid gridRowGap="m" color="darkPurple" pt="2xs" pb="l" px="l">
          <Table width="100%">
            <Table.tbody>
              <Table.tr>
                <Table.td>
                  <Text>CDP ID</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">
                    <Link>{selectedCDP.id}</Link>
                  </Text>
                </Table.td>
              </Table.tr>
              <Table.tr>
                <Table.td>
                  <Text>Stability Fee</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">{selectedCDP.govFeeMKR} MKR</Text>
                </Table.td>
              </Table.tr>
            </Table.tbody>
          </Table>
          <Grid>
            <LoadingToggle
              completeText={'MKR unlocked'}
              loadingText={'Unlocking MKR'}
              defaultText={'Unlock MKR to continue'}
              tokenDisplayName={'MKR'}
              isLoading={mkrApprovePending}
              isComplete={proxyDetails.hasMkrAllowance}
              onToggle={giveProxyMkrAllowance}
              disabled={proxyDetails.hasMkrAllowance || !proxyDetails.address}
              data-testid="allowance-toggle"
            />
          </Grid>
          <Grid alignItems="center" gridTemplateColumns="auto 1fr">
            <Checkbox
              mr="s"
              fontSize="l"
              checked={hasReadTOS}
              onChange={() => setHasReadTOS(!hasReadTOS)}
            />
            <Text
              t="caption"
              color="steel"
              onClick={() => setHasReadTOS(!hasReadTOS)}
            >
              I have read and accept the{' '}
              <Link target="_blank" href="https://migrate.makerdao.com/terms">
                Terms of Service
              </Link>
              .
            </Text>
          </Grid>
        </Grid>
        <Grid gridRowGap="m" color="darkPurple" pt="2xs" pb="l" px="l">
          <Table width="100%">
            <Table.tbody>
              <Table.tr>
                <Table.td>
                  <Text>CDP ID</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">
                    <Link>{selectedCDP.id}</Link>
                  </Text>
                </Table.td>
              </Table.tr>
              <Table.tr>
                <Table.td>
                  <Text>Stability Fee</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">
                    {selectedCDP.govFeeMKR} MKR ({selectedCDP.govFeeDai} DAI)
                  </Text>
                </Table.td>
              </Table.tr>
              <Table.tr>
                <Table.td>
                  <Text>Max Cost (5% Slippage)</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">
                    {prettifyNumber(maxCost, false, 4)}
                  </Text>
                </Table.td>
              </Table.tr>
              <Table.tr>
                <Table.td>
                  <Text>Current Col. Ratio</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">
                    {selectedCDP.collateralizationRatio} %
                  </Text>
                </Table.td>
              </Table.tr>
              <Table.tr>
                <Table.td>
                  <Text>Min New Col. Ratio</Text>
                </Table.td>
                <Table.td textAlign="right">
                  <Text fontWeight="medium">
                    {prettifyNumber(minNewCollatRatio, false, 2, false)} %
                  </Text>
                </Table.td>
              </Table.tr>
            </Table.tbody>
          </Table>
          <Grid alignItems="center" gridTemplateColumns="auto 1fr">
            <Checkbox
              mr="s"
              fontSize="l"
              checked={hasReadTOS}
              onChange={() => setHasReadTOS(!hasReadTOS)}
            />
            <Text
              t="caption"
              color="steel"
              onClick={() => setHasReadTOS(!hasReadTOS)}
            >
              I have read and accept the{' '}
              <Link target="_blank" href="https://migrate.makerdao.com/terms">
                Terms of Service
              </Link>
              .
            </Text>
          </Grid>
        </Grid>
      </CardTabs>
      <Grid
        gridTemplateColumns="auto auto"
        justifyContent="center"
        gridColumnGap="m"
      >
        <Button
          justifySelf="center"
          variant="secondary-outline"
          onClick={onPrev}
        >
          Back
        </Button>
        <Button
          justifySelf="center"
          disabled={!hasReadTOS || !proxyDetails.hasMkrAllowance}
          onClick={() => {
            migrateCdp();
            onNext();
          }}
        >
          Pay and Migrate
        </Button>
      </Grid>
    </Grid>
  );
};

export default PayAndMigrate;
