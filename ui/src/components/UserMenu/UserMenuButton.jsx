import React, { Component, Fragment } from 'react';
import classNames from 'classnames';
import { object } from 'prop-types';
import { withApollo } from 'react-apollo';
import Avatar from '@material-ui/core/Avatar';
import { withStyles } from '@material-ui/core/styles';
import IconButton from '@material-ui/core/IconButton';
import Button from '../Button';
import SignInDialog from '../SignInDialog';
import { withAuth } from '../../utils/Auth';
import getPictureFromUser from '../../utils/getPictureFromUser';
import username from '../../utils/username';

@withAuth
@withApollo
@withStyles(theme => ({
  avatarButton: {
    height: 6 * theme.spacing(1),
    width: 6 * theme.spacing(1),
    padding: 0,
  },
}))
export default class UserMenuButton extends Component {
  static propTypes = {
    avatarProps: object,
    buttonProps: object,
  };

  static defaultProps = {
    avatarProps: null,
    buttonProps: null,
  };

  render() {
    const {
      className,
      classes,
      user,
      avatarProps,
      buttonProps,
      signInDialogOpen,
      onSignInDialogOpen,
      onSignInDialogClose,
      onMenuClick,
      onAuthorize,
      onUnauthorize,
      ...props
    } = this.props;
    const avatarSrc = getPictureFromUser(user);

    if (!user) {
      return (
        <Fragment>
          <Button
            className={className}
            size="small"
            variant="contained"
            color="primary"
            onClick={onSignInDialogOpen}
            id="sign-in-button"
            {...buttonProps}
            {...props}>
            Sign in
          </Button>
          <SignInDialog open={signInDialogOpen} onClose={onSignInDialogClose} />
        </Fragment>
      );
    }

    const profileName = username(user);

    return (
      <IconButton
        className={classNames(classes.avatarButton, className)}
        aria-haspopup="true"
        aria-controls="user-menu"
        aria-label="user menu"
        id="user-menu-button"
        onClick={onMenuClick}
        {...props}>
        {avatarSrc ? (
          <Avatar alt={profileName} src={avatarSrc} {...avatarProps} />
        ) : (
          <Avatar alt={profileName} {...avatarProps}>
            {profileName[0]}
          </Avatar>
        )}
      </IconButton>
    );
  }
}
