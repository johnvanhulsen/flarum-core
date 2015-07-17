import Modal from 'flarum/components/Modal';

/**
 * The `ChangePasswordModal` component shows a modal dialog which allows the
 * user to send themself a password reset email.
 */
export default class ChangePasswordModal extends Modal {
  className() {
    return 'ChangePasswordModal Modal--small';
  }

  title() {
    return app.trans('core.change_password');
  }

  content() {
    return (
      <div className="Modal-body">
        <div className="Form Form--centered">
          <p className="helpText">{app.trans('core.change_password_help')}</p>
          <div className="Form-group">
            <button type="submit" className="Button Button--primary Button--block" disabled={this.loading}>
              {app.trans('core.send_password_reset_email')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  onsubmit(e) {
    e.preventDefault();

    this.loading = true;

    app.request({
      method: 'POST',
      url: app.forum.attribute('apiUrl') + '/forgot',
      data: {email: app.session.user.email()}
    }).then(
      () => this.hide(),
      () => this.loading = false
    );
  }
}
