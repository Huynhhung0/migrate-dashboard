import React, { useMaker } from 'react';
import {
  Grid,
  Text,
  Button,
  Card,
  Table,
  Link
} from '@makerdao/ui-components-core';
import { OASIS_HOSTNAME } from '../../utils/constants';
import arrowTopRight from '../../assets/icons/arrowTopRight.svg';
import blueArrowTopRight from '../../assets/icons/blueArrowTopRight.svg';
import { etherscanLink } from '../../utils/ethereum';

function Complete({
  onReset,
  onClose,
  selectedCDP: cdp,
  newCdpId,
  migrationTxHash
}) {
  const { network } = useMaker();

  return (
    <Grid gridRowGap="m" mx={'s'}>
      <Text.h2 textAlign="center">Migration complete</Text.h2>
      <Text.p fontSize="1.7rem" color="darkLavender" textAlign="center">
        CDP #{cdp.id} has been successfully migrated to Multi-collateral Dai.{' '}
      </Text.p>
      <Link
        justifySelf="center"
        target="_blank"
        href={etherscanLink(migrationTxHash, network)}
      >
        <Button
          my="xs"
          justifySelf="center"
          fontSize="s"
          py="xs"
          px="s"
          variant="secondary"
        >
          View transaction details <img src={arrowTopRight} />
        </Button>
      </Link>
      <Card px="l" py="s" width="100%" maxWidth="400px" justifySelf="center">
        <Table width="100%">
          <tbody>
            <Table.tr>
              <Table.td>
                <Text color="darkPurple">Your new Vault ID</Text>
              </Table.td>
              <Table.td textAlign="right">
                <a
                  fontWeight="medium"
                  href={`${OASIS_HOSTNAME}/borrow/${newCdpId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  #{newCdpId}{' '}
                  <img src={blueArrowTopRight} style={{ fill: '#0000EE' }} />
                </a>
              </Table.td>
            </Table.tr>
          </tbody>
        </Table>
      </Card>
      <Grid gridRowGap="s" justifySelf="center">
        <Button mt="s" onClick={onReset}>
          Migrate another CDP
        </Button>
        <Button variant="secondary-outline" onClick={onClose}>
          Exit
        </Button>
      </Grid>
    </Grid>
  );
}

export default Complete;
