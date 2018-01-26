<?php

/*
 * This file is part of Flarum.
 *
 * (c) Toby Zerner <toby.zerner@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Flarum\Discussion;

use Carbon\Carbon;
use Flarum\Event\ScopeModelVisibility;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\AbstractPolicy;
use Flarum\User\Gate;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\Eloquent\Builder;

class DiscussionPolicy extends AbstractPolicy
{
    /**
     * {@inheritdoc}
     */
    protected $model = Discussion::class;

    /**
     * @var SettingsRepositoryInterface
     */
    protected $settings;

    /**
     * @var Gate
     */
    protected $gate;

    /**
     * @var Dispatcher
     */
    protected $events;

    /**
     * @param SettingsRepositoryInterface $settings
     * @param Gate $gate
     * @param Dispatcher $events
     */
    public function __construct(SettingsRepositoryInterface $settings, Gate $gate, Dispatcher $events)
    {
        $this->settings = $settings;
        $this->gate = $gate;
        $this->events = $events;
    }

    /**
     * @param User $actor
     * @param string $ability
     * @return bool|null
     */
    public function can(User $actor, $ability)
    {
        if ($actor->hasPermission('discussion.'.$ability)) {
            return true;
        }
    }

    /**
     * @param User $actor
     * @param Builder $query
     */
    public function find(User $actor, Builder $query)
    {
        if ($actor->cannot('viewDiscussions')) {
            $query->whereRaw('FALSE');

            return;
        }

        // Hide private discussions by default.
        $query->where(function ($query) use ($actor) {
            $query->where('discussions.is_private', false)
                ->orWhere(function ($query) use ($actor) {
                    $this->events->fire(
                        new ScopeModelVisibility($query, $actor, 'viewPrivate')
                    );
                });
        });

        // Hide hidden discussions, unless they are authored by the current
        // user, or the current user has permission to view hidden discussions.
        if (! $actor->hasPermission('discussion.hide')) {
            $query->where(function ($query) use ($actor) {
                $query->whereNull('discussions.hide_time')
                    ->orWhere('start_user_id', $actor->id)
                    ->orWhere(function ($query) use ($actor) {
                        $this->events->fire(
                            new ScopeModelVisibility($query, $actor, 'hide')
                        );
                    });
            });
        }

        // Hide discussions with no comments, unless they are authored by the
        // current user.
        $query->where(function ($query) use ($actor) {
            $query->where('comments_count', '>', 0)
                ->orWhere('start_user_id', $actor->id)
                ->orWhere(function ($query) use ($actor) {
                    $this->events->fire(
                        new ScopeModelVisibility($query, $actor, 'viewEmpty')
                    );
                });
        });
    }

    /**
     * @param User $actor
     * @param \Flarum\Discussion\Discussion $discussion
     * @return bool|null
     */
    public function rename(User $actor, Discussion $discussion)
    {
        if ($discussion->start_user_id == $actor->id) {
            $allowRenaming = $this->settings->get('allow_renaming');

            if ($allowRenaming === '-1'
                || ($allowRenaming === 'reply' && $discussion->participants_count <= 1)
                || ($discussion->start_time->diffInMinutes(new Carbon) < $allowRenaming)) {
                return true;
            }
        }
    }

    /**
     * @param User $actor
     * @param \Flarum\Discussion\Discussion $discussion
     * @return bool|null
     */
    public function hide(User $actor, Discussion $discussion)
    {
        if ($discussion->start_user_id == $actor->id && $discussion->participants_count <= 1) {
            return true;
        }
    }
}
