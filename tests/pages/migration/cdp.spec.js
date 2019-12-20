import MigrateCdp from '../../../pages/migration/cdp';
import render from '../../helpers/render';
import { instantiateMaker, SAI, DAI } from '../../../maker';
import { ETH } from '@makerdao/dai-plugin-mcd';
import {
  mineBlocks,
  takeSnapshot,
  restoreSnapshot
} from '@makerdao/test-helpers';
import {
  act,
  cleanup,
  fireEvent,
  wait,
  waitForElement
} from '@testing-library/react';

import Maker from '@makerdao/dai';
import McdPlugin from '@makerdao/dai-plugin-mcd';
import BigNumber from 'bignumber.js';
import round from 'lodash/round';
const { change, click } = fireEvent;

async function openLockAndDrawScdCdp(drawAmount, maker, proxyTransfer=true) {
  const cdp = await maker.openCdp();
  await cdp.lockEth((drawAmount * 1.5) / 150);
  await cdp.drawDai(drawAmount);
  const proxy = await maker.service('proxy').currentProxy();
  if (proxyTransfer) await cdp.give(proxy);
  return cdp;
}

async function migrateSaiToDai(amount, maker) {
  const migrationContractAddress = maker
    .service('smartContract')
    .getContract('MIGRATION').address;
  await maker.getToken('SAI').approveUnlimited(migrationContractAddress);
  const daiMigration = maker.service('migration').getMigration('sai-to-dai');
  await daiMigration.execute(SAI(amount));
}

afterEach(cleanup);

test('basic rendering', async () => {
  const { getByText } = await render(<MigrateCdp />);
  getByText(/Select a CDP/);
});

test('show different messages depending on saiAvailable value', async () => {
  const { getByText, dispatch } = await render(<MigrateCdp />, {
    initialState: { saiAvailable: SAI(100.789) }
  });

  getByText(/CDPs with less than 20 or more than 100.79 SAI/);

  act(() => dispatch({ type: 'assign', payload: { saiAvailable: SAI(10) } }));
  getByText(/There is not enough Sai available/);
});

test('not enough SAI', async () => {
  const { getByText } = await render(<MigrateCdp />, {
    initialState: {
      saiAvailable: SAI(10)
    }
  });
  getByText(
    'There is not enough Sai available to migrate CDPs at this time. Please try again later.'
  );
});

describe('with live testchain', () => {
  let maker, snapshotData, proxy, proxyCdp, nonProxyCdp, lowCdp, cdpMigrationCheck;

  beforeEach(async () => {
    jest.setTimeout(20000);
    maker = await instantiateMaker('test');
    snapshotData = await takeSnapshot(maker);

    proxy = await maker.service('proxy').currentProxy();
    const address = maker.currentAddress()
    console.log('creating liquidity...');
    await openLockAndDrawScdCdp(50, maker);
    await migrateSaiToDai(50, maker);

    console.log('creating a CDP to migrate...');
    proxyCdp = await openLockAndDrawScdCdp(25, maker);
    // nonProxyCdp = await openLockAndDrawScdCdp(25, maker, false)
    lowCdp = await openLockAndDrawScdCdp(10, maker);

    cdpMigrationCheck = {
      [proxy]: [proxyCdp.id],
      // [address]: [nonProxyCdp.id]
    };
    // console.log(cdpMigrationCheck);
  });
  test('cdp under 20', async () => {
    cdpMigrationCheck = {
      [proxy]: [lowCdp.id],
      // [address]: [nonProxyCdp.id]
    };
    const {
      getAllByTestId,
      queryByRole
    } = await render(<MigrateCdp />, {
      initialState: {
        saiAvailable: SAI(110),
        cdpMigrationCheck,
        maker,
        account: window.maker.currentAddress()
      }
    });
    await waitForElement(() => getAllByTestId('cdpListItem'));
    expect(queryByRole('radio')).toBeNull()
  })

  afterEach(async () => {
    await restoreSnapshot(snapshotData, maker);
  });

  test('the whole flow', async () => {
    const {
      getAllByTestId,
      getByText,
      getByRole,
      queryByRole,
      getAllByRole,
      debug
    } = await render(<MigrateCdp />, {
      initialState: {
        saiAvailable: SAI(110),
        cdpMigrationCheck,
        maker,
        account: window.maker.currentAddress()
      }
    });

    await wait(() => expect(window.maker).toBeTruthy());

    const address = window.maker.currentAddress();
    expect(address).toEqual(maker.currentAddress());

    await waitForElement(() => getAllByTestId('cdpListItem'));
    const cdpRadio = await waitForElement(() => getAllByRole('radio'))
    click(cdpRadio[0])
    getByText('Continue')
    click(getByText('Continue'));

    debug();
    // select the cdp
    // click continue
    // proxy & transfer screen will be skipped
    // pay with MKR
    // in progress
    // complete

    // check using the maker instance that the user now has an MCD CDP
  });
});
